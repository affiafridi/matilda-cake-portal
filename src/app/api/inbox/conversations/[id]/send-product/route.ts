import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

// WhatsApp needs this gap between CTA-URL interactive messages to the same
// recipient — shorter gaps cause all but the last to be silently dropped.
const SEND_GAP_MS = 1500;

type ProductItem = {
  productId:        number;
  productName:      string;
  productPrice?:    string;
  productImageUrl?: string;
  variationId?:     number;
  variationName?:   string;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function postToWhatsApp(
  wa_phone_number_id: string,
  wa_access_token:    string,
  waId:               string,
  interactive:        Record<string, unknown>,
): Promise<string> {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${wa_phone_number_id}/messages`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${wa_access_token}` },
      body:    JSON.stringify({ messaging_product: "whatsapp", to: waId, type: "interactive", interactive }),
    },
  );

  const json = await res.json().catch(() => ({})) as {
    messages?: { id: string }[];
    error?:    { message: string; code?: number };
  };

  if (!json.messages?.[0]?.id) {
    const errMsg = json.error?.message ?? `WhatsApp API ${res.status}`;
    throw new Error(errMsg);
  }

  return json.messages[0].id;
}

async function sendOneCard(
  item:               ProductItem,
  conversation:       { id: string; waId: string },
  actorId:            string,
  wa_phone_number_id: string,
  wa_access_token:    string,
  baseWc:             string,
  origin:             string,
) {
  const { productId, productName, productPrice, productImageUrl, variationId, variationName } = item;

  const displayName = variationName ? `${productName} — ${variationName}` : productName;
  const bodyText    = productPrice ? `${displayName}\n💰 ${productPrice}` : displayName;

  // Build WC checkout URL
  const checkoutParams = new URLSearchParams({
    "add-to-cart": String(productId),
    quantity:      "1",
    utm_source:    "whatsapp",
    utm_medium:    "chat",
    wa_id:         conversation.waId,
  });
  if (variationId) checkoutParams.set("variation_id", String(variationId));
  const checkoutUrl = `${baseWc}/checkout/?${checkoutParams.toString()}`;

  // Wrap in click-tracking redirect
  const trackingUrl =
    `${origin}/api/track/wc-click` +
    `?waId=${encodeURIComponent(conversation.waId)}` +
    `&url=${encodeURIComponent(checkoutUrl)}` +
    `&product=${encodeURIComponent(displayName)}`;

  // Build interactive payload — with image header when available
  const interactiveWithImage: Record<string, unknown> = {
    type:   "cta_url",
    header: productImageUrl ? { type: "image", image: { link: productImageUrl } } : undefined,
    body:   { text: bodyText },
    action: { name: "cta_url", parameters: { display_text: "Order Today", url: trackingUrl } },
  };
  // Remove undefined keys — WhatsApp API rejects unknown nullish fields
  if (!interactiveWithImage.header) delete interactiveWithImage.header;

  let waMessageId: string;
  try {
    waMessageId = await postToWhatsApp(wa_phone_number_id, wa_access_token, conversation.waId, interactiveWithImage);
  } catch (firstErr) {
    // If we had an image header and the send failed, retry without it.
    // Meta's servers can't always reach WooCommerce image URLs (CDN/auth issues).
    if (productImageUrl) {
      console.warn(`[send-product] image send failed for "${displayName}", retrying without image:`, firstErr);
      const interactiveNoImage: Record<string, unknown> = {
        type:   "cta_url",
        body:   { text: bodyText },
        action: { name: "cta_url", parameters: { display_text: "Order Today", url: trackingUrl } },
      };
      waMessageId = await postToWhatsApp(wa_phone_number_id, wa_access_token, conversation.waId, interactiveNoImage);
    } else {
      throw firstErr;
    }
  }

  const now       = new Date();
  const savedBody = `[Product] ${displayName}${productPrice ? ` · ${productPrice}` : ""}`;

  await prisma.$transaction([
    prisma.message.create({
      data: {
        id:             crypto.randomUUID(),
        conversationId: conversation.id,
        waMessageId,
        direction:      "OUTBOUND",
        messageStatus:  "SENT",
        body:           savedBody,
        sentById:       actorId,
        createdAt:      now,
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt:    now,
        lastMessageBody:  savedBody,
        lastHumanReplyAt: now,
        botPaused:        true,
        status:           "OPEN",
      },
    }),
  ]);
}

/**
 * POST /api/inbox/conversations/[id]/send-product
 *
 * Accepts a single item OR an array of items.
 * Items are sent sequentially with a 1500 ms gap — WhatsApp silently drops
 * earlier CTA-URL interactive messages when they arrive faster than this.
 *
 * Body (single):  { productId, productName, productPrice?, productImageUrl?, variationId?, variationName? }
 * Body (bulk):    { items: ProductItem[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRole(ALLOWED);
    const { id } = await params;

    const body = await req.json().catch(() => ({})) as ProductItem | { items: ProductItem[] };
    const items: ProductItem[] = "items" in body ? body.items : [body as ProductItem];

    if (!items.length) return jsonError("No items provided", 400);
    for (const item of items) {
      if (!item.productId || !item.productName) {
        return jsonError("Each item requires productId and productName", 400);
      }
    }

    const conversation = await prisma.conversation.findUnique({
      where:  { id },
      select: { id: true, waId: true },
    });
    if (!conversation) return jsonError("Conversation not found", 404);

    const { wa_phone_number_id, wa_access_token, wc_url } = await getIntegrations();
    if (!wa_phone_number_id || !wa_access_token) return jsonError("WhatsApp credentials not configured", 500);

    const baseWc = (wc_url || "").replace(/\/$/, "");
    if (!baseWc) return jsonError("WooCommerce URL not configured", 500);

    // req.nextUrl.origin returns the internal localhost address on Cloud Run.
    // Use the forwarded headers set by the load balancer to get the real public URL.
    const proto  = req.headers.get("x-forwarded-proto") ?? "https";
    const host   = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.hostname;
    const origin = `${proto}://${host}`;
    const failed: string[] = [];

    for (let i = 0; i < items.length; i++) {
      if (i > 0) await sleep(SEND_GAP_MS);
      try {
        await sendOneCard(items[i], conversation, actor.id, wa_phone_number_id, wa_access_token, baseWc, origin);
      } catch (err) {
        const label = items[i].variationName
          ? `${items[i].productName} — ${items[i].variationName}`
          : items[i].productName;
        failed.push(label);
        console.error(`[send-product] failed for "${label}":`, err);
      }
    }

    if (failed.length === items.length) {
      return jsonError(`All ${items.length} cards failed to send`, 502);
    }

    return jsonOk({ ok: true, sent: items.length - failed.length, failed });
  } catch (err) {
    return handleApiError(err);
  }
}
