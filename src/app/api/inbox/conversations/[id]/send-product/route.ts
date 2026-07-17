import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

type ProductItem = {
  productId:        number;
  productName:      string;
  productPrice?:    string;
  productImageUrl?: string;
  variationId?:     number;
  variationName?:   string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendOneCard(
  item:              ProductItem,
  conversation:      { id: string; waId: string },
  actorId:           string,
  wa_phone_number_id: string,
  wa_access_token:   string,
  baseWc:            string,
  origin:            string,
) {
  const { productId, productName, productPrice, productImageUrl, variationId, variationName } = item;

  const checkoutParams = new URLSearchParams({
    "add-to-cart": String(productId),
    quantity:      "1",
    utm_source:    "whatsapp",
    utm_medium:    "chat",
    wa_id:         conversation.waId,
  });
  if (variationId) checkoutParams.set("variation_id", String(variationId));
  const checkoutUrl = `${baseWc}/checkout/?${checkoutParams.toString()}`;

  const trackingUrl =
    `${origin}/api/track/wc-click` +
    `?waId=${encodeURIComponent(conversation.waId)}` +
    `&url=${encodeURIComponent(checkoutUrl)}`;

  const displayName = variationName ? `${productName} — ${variationName}` : productName;
  const bodyText    = productPrice ? `${displayName}\n💰 ${productPrice}` : displayName;

  const interactive: Record<string, unknown> = {
    type: "cta_url",
    body: { text: bodyText },
    action: { name: "cta_url", parameters: { display_text: "Order Today", url: trackingUrl } },
  };
  if (productImageUrl) {
    interactive.header = { type: "image", image: { link: productImageUrl } };
  }

  const waRes = await fetch(
    `https://graph.facebook.com/v20.0/${wa_phone_number_id}/messages`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${wa_access_token}` },
      body:    JSON.stringify({ messaging_product: "whatsapp", to: conversation.waId, type: "interactive", interactive }),
    },
  );

  const waJson = await waRes.json().catch(() => ({})) as {
    messages?: { id: string }[];
    error?:    { message: string };
  };

  if (!waJson.messages?.[0]?.id) {
    throw new Error(waJson.error?.message ?? "WhatsApp send failed");
  }

  const waMessageId = waJson.messages[0].id;
  const now         = new Date();
  const savedBody   = `[Product] ${displayName}${productPrice ? ` · ${productPrice}` : ""}`;

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
 * When multiple items are provided they are sent one by one with a 600ms gap
 * so WhatsApp doesn't rate-limit and messages arrive in order.
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

    const body = await req.json().catch(() => ({})) as
      | ProductItem
      | { items: ProductItem[] };

    // Normalise to array
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

    const origin = req.nextUrl.origin;

    const failed: string[] = [];
    for (let i = 0; i < items.length; i++) {
      if (i > 0) await sleep(600);
      try {
        await sendOneCard(items[i], conversation, actor.id, wa_phone_number_id, wa_access_token, baseWc, origin);
      } catch (err) {
        const name = items[i].variationName
          ? `${items[i].productName} — ${items[i].variationName}`
          : items[i].productName;
        failed.push(name);
        console.error(`[send-product] failed for "${name}":`, err);
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
