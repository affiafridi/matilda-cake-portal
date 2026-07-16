import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { getIntegrations } from "@/lib/integrations";
import { handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/woocommerce/order-webhook
 *
 * WooCommerce calls this when an order is created or updated.
 * Set up two webhooks in WC admin (Settings → Advanced → Webhooks):
 *   - Topic: Order created  → Delivery URL: <portal>/api/woocommerce/order-webhook
 *   - Topic: Order updated  → Delivery URL: <portal>/api/woocommerce/order-webhook
 *
 * Matches a WC order to a WhatsApp lead by:
 *   1. wa_id meta field (if bot appended ?wa_id= to checkout URL)
 *   2. Billing phone number (normalized, always present)
 *
 * WC order status → lead stage:
 *   pending / on-hold  → ORDER_CREATED
 *   processing / completed → PAID
 *   cancelled / failed / refunded → ABANDONED
 */
export async function POST(req: NextRequest) {
  try {
    const { wc_webhook_secret } = await getIntegrations();

    // Verify WC webhook signature (HMAC-SHA256 over raw body)
    const rawBody  = await req.text();
    const sig      = req.headers.get("x-wc-webhook-signature") ?? "";

    if (wc_webhook_secret) {
      const expected = createHmac("sha256", wc_webhook_secret).update(rawBody).digest("base64");
      if (sig !== expected) {
        console.warn("[wc-webhook] Invalid signature");
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    let order: WcOrder;
    try {
      order = JSON.parse(rawBody) as WcOrder;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    if (!order?.id) return NextResponse.json({ ok: true }); // not an order payload

    const stage = wcStatusToLeadStage(order.status);
    if (!stage) {
      // Unrecognised status — acknowledge and ignore
      return NextResponse.json({ ok: true });
    }

    // ── Match by wa_id in meta_data first ──────────────────────────────────
    const waIdMeta = order.meta_data?.find(
      (m) => m.key === "wa_id" || m.key === "_wc_order_attribution_wa_id",
    );
    const waIdRaw = waIdMeta?.value ? String(waIdMeta.value).replace(/^\+/, "") : null;

    let lead = waIdRaw
      ? await prisma.whatsappLead.findFirst({
          where:   { waId: waIdRaw, stage: { notIn: ["PAID", "ABANDONED"] } },
          orderBy: { createdAt: "desc" },
        })
      : null;

    // ── Fallback: match by billing phone ───────────────────────────────────
    if (!lead && order.billing?.phone) {
      const phones = normalizePhone(order.billing.phone);
      for (const phone of phones) {
        lead = await prisma.whatsappLead.findFirst({
          where:   { waId: phone, stage: { notIn: ["PAID", "ABANDONED"] } },
          orderBy: { createdAt: "desc" },
        });
        if (lead) break;
      }
    }

    const productName  = order.line_items?.[0]?.name ?? null;
    const productPrice = order.total ?? null;
    const customerName = [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(" ") || null;

    if (lead) {
      // Update existing lead
      await prisma.whatsappLead.update({
        where: { id: lead.id },
        data: {
          stage,
          ...(customerName  && { customerName }),
          ...(productName   && { productName  }),
          ...(productPrice  && { productPrice }),
          updatedAt: new Date(),
        },
      });
    } else if (waIdRaw || order.billing?.phone) {
      // Create a new lead if we have any identifier — this covers customers who
      // came via WC link without going through the bot's CLICKED event
      const cleanWaId = waIdRaw ?? normalizePhone(order.billing?.phone ?? "")[0] ?? "";
      if (cleanWaId) {
        await prisma.whatsappLead.create({
          data: {
            id:           crypto.randomUUID(),
            waId:         cleanWaId,
            customerName: customerName || cleanWaId,
            phone:        cleanWaId,
            orderDetails: productName || "",
            source:       "woocommerce",
            stage,
            status:       "NEW",
            productName:  productName  || null,
            productPrice: productPrice || null,
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type WcOrder = {
  id:         number;
  status:     string;
  total?:     string;
  billing?: {
    first_name?: string;
    last_name?:  string;
    phone?:      string;
  };
  line_items?: { name?: string; total?: string }[];
  meta_data?:  { key: string; value: unknown }[];
};

function wcStatusToLeadStage(status: string): string | null {
  switch (status) {
    case "pending":
    case "on-hold":
      return "ORDER_CREATED";
    case "processing":
    case "completed":
      return "PAID";
    case "cancelled":
    case "failed":
    case "refunded":
      return "ABANDONED";
    default:
      return null;
  }
}

/**
 * Returns multiple normalized variants of a phone number so we can match
 * regardless of how the customer typed it in WooCommerce.
 *
 * Examples (UAE 971 prefix):
 *   "+971 50 123 4567" → ["971501234567", "0501234567", "501234567"]
 *   "050 123 4567"     → ["0501234567", "971501234567", "501234567"]
 */
function normalizePhone(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return [];

  const variants = new Set<string>();
  variants.add(digits);

  // Strip leading +/00 country code to get local number
  if (digits.startsWith("00")) variants.add(digits.slice(2));

  // UAE-specific: 971xxxxxxxxx ↔ 0xxxxxxxxx ↔ xxxxxxxxx
  if (digits.startsWith("971") && digits.length >= 11) {
    const local = digits.slice(3);       // e.g. 501234567
    variants.add("0" + local);           // 0501234567
    variants.add(local);                 // 501234567
  } else if (digits.startsWith("0") && digits.length >= 9) {
    const local = digits.slice(1);       // 501234567
    variants.add("971" + local);         // 971501234567
    variants.add(local);                 // 501234567
  } else if (digits.length >= 9) {
    variants.add("971" + digits);        // assume UAE local without leading 0
    variants.add("0" + digits);
  }

  return [...variants];
}
