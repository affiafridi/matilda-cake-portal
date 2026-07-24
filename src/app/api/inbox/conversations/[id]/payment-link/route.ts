import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";
import { createCCAvenueQuickBill, type CCAvenueDeliveryType } from "@/lib/ccavenue";
import { buildOrderNumber, buildTrackingCode } from "@/lib/orders/codes";
import { pgNotify } from "@/lib/sse-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

const AMOUNT_RE       = /^\d+(\.\d{1,2})?$/;
const VALID_CURRENCIES = new Set(["AED", "USD", "EUR", "GBP", "SAR", "INR"]);
const VALID_DELIVERY   = new Set<CCAvenueDeliveryType>(["E", "S", "B"]);

/**
 * POST /api/inbox/conversations/[id]/payment-link
 *
 * Creates a CCAvenue Quick Invoice and sends the payment link via WhatsApp.
 * CCAvenue handles Email and/or SMS delivery on their end based on deliveryType.
 *
 * Body:
 * {
 *   amount:           string            e.g. "250.00"
 *   currency:         string            e.g. "AED"
 *   description:      string            shown on invoice
 *   deliveryType:     "E"|"S"|"B"       E=Email, S=SMS, B=Both
 *   customerEmail?:   string            required when deliveryType is E or B
 *   customerMobile?:  string            required when deliveryType is S or B
 *   validFor?:        number            days until link expires (default 10)
 *   termsAndConditions?: string
 * }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(ALLOWED);
    const { id } = await params;

    const body = await req.json().catch(() => ({})) as {
      amount?:             string;
      currency?:           string;
      description?:        string;
      deliveryType?:       string;
      customerEmail?:      string;
      customerMobile?:     string;
      validFor?:           number;
      termsAndConditions?: string;
    };

    // ── Validate inputs ────────────────────────────────────────────────────
    const amountStr    = (body.amount ?? "").trim();
    const currency     = (body.currency ?? "AED").trim().toUpperCase();
    const description  = (body.description ?? "").trim();
    const deliveryType = (body.deliveryType ?? "").toUpperCase() as CCAvenueDeliveryType;
    const customerEmail  = (body.customerEmail ?? "").trim();
    const customerMobile = (body.customerMobile ?? "").trim();
    const validFor     = Math.max(1, Math.min(365, Number(body.validFor) || 10));

    if (!amountStr || !AMOUNT_RE.test(amountStr)) {
      return jsonError("Invalid amount — must be a positive number e.g. 250 or 99.99", 400);
    }
    const amountNum = parseFloat(amountStr);
    if (amountNum <= 0 || amountNum > 999_999) {
      return jsonError("Amount must be between 0.01 and 999,999", 400);
    }
    if (!VALID_CURRENCIES.has(currency)) return jsonError("Unsupported currency", 400);
    if (!description) return jsonError("Description is required", 400);
    if (description.length > 200) return jsonError("Description too long (max 200 chars)", 400);
    if (!VALID_DELIVERY.has(deliveryType)) {
      return jsonError("deliveryType must be E (Email), S (SMS), or B (Both)", 400);
    }
    if ((deliveryType === "E" || deliveryType === "B") && !customerEmail) {
      return jsonError("Customer email is required for email delivery", 400);
    }
    if ((deliveryType === "S" || deliveryType === "B") && !customerMobile) {
      return jsonError("Customer mobile is required for SMS delivery", 400);
    }
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return jsonError("Invalid email address", 400);
    }

    // ── Load credentials (server-side only) ────────────────────────────────
    const {
      ccavenue_merchant_id,
      ccavenue_access_code,
      ccavenue_working_key,
      ccavenue_website_url,
      ccavenue_api_url,
      wa_phone_number_id: phoneNumberId,
      wa_access_token:   accessToken,
    } = await getIntegrations();

    if (!ccavenue_merchant_id || !ccavenue_access_code || !ccavenue_working_key) {
      return jsonError("CCAvenue integration not configured. Go to Admin → Integrations → CCAvenue to set it up.", 503);
    }
    if (!phoneNumberId || !accessToken) {
      return jsonError("WhatsApp credentials not configured", 503);
    }

    // ── Verify conversation ────────────────────────────────────────────────
    const conversation = await prisma.conversation.findUnique({
      where:  { id },
      select: { id: true, waId: true, customerName: true },
    });
    if (!conversation) return jsonError("Conversation not found", 404);

    const appUrl = (ccavenue_website_url || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const amount = amountNum.toFixed(2);

    // Reference visible in CCAvenue dashboard: AGT-{AGENTNAME}-{TIMESTAMP}-{RANDOM}
    const agentSlug = actor.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 10);
    const referenceNo = `AGT-${agentSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // ── Create Order in portal DB (for tracking + webhook auto-update) ─────
    const MAX_RETRIES = 5;
    let order: Awaited<ReturnType<typeof prisma.order.create>> | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        order = await prisma.order.create({
          data: {
            orderNumber:           buildOrderNumber(),
            trackingCode:          buildTrackingCode(),
            customerName:          conversation.customerName,
            customerPhone:         customerMobile || conversation.waId,
            whatsappNumber:        conversation.waId,
            customerEmail:         customerEmail || null,
            deliveryDate:          new Date(Date.now() + validFor * 24 * 60 * 60 * 1000),
            deliveryTime:          "TBD",
            deliveryAddress:       "TBD",
            orderItems:            description,
            paymentMethod:         "CCAVENUE",
            paymentStatus:         "UNPAID",
            totalAmount:           amountNum,
            source:                "WHATSAPP",
            paymentGatewayOrderId: referenceNo,
            notes:                 `Quick invoice sent by agent: ${actor.name} | Delivery: ${deliveryType}`,
            createdById:           actor.id,
          },
        });
        break;
      } catch (e: unknown) {
        const isUnique = e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002";
        if (isUnique && attempt < MAX_RETRIES - 1) continue;
        throw e;
      }
    }
    if (!order) throw new Error("Failed to create order after multiple attempts");

    // ── Call CCAvenue Quick Bill API ───────────────────────────────────────
    let billResult: Awaited<ReturnType<typeof createCCAvenueQuickBill>>;
    try {
      billResult = await createCCAvenueQuickBill({
        merchantId:    ccavenue_merchant_id,
        accessCode:    ccavenue_access_code,
        workingKey:    ccavenue_working_key,
        apiUrl:        ccavenue_api_url,
        customerName:  conversation.customerName,
        // Only pass email/mobile when the delivery type actually needs them
        // Never fall back to waId as email — a phone number is not a valid email
        customerEmail:  customerEmail || "",
        customerMobile: customerMobile || conversation.waId,
        referenceNo,
        amount,
        currency,
        deliveryType,
        description,
        emailSubject:  `Payment request: ${description}`,
        validFor,
        validPeriod:   "days",
        termsAndConditions: body.termsAndConditions ?? "",
        // Tell CCAvenue where to POST payment notifications
        callbackUrl: `${appUrl}/api/ccavenue/webhook`,
      });
    } catch (err) {
      // Roll back order so no ghost record
      await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
      const message = err instanceof Error ? err.message : "CCAvenue API error";
      return jsonError(message, 502);
    }

    // ── Send pay link via WhatsApp ─────────────────────────────────────────
    const deliveryLabel =
      deliveryType === "E" ? "email" :
      deliveryType === "S" ? "SMS" :
      "email and SMS";

    const messageText = `💳 *Payment Request*\n\n*${description}*\n*Amount:* ${currency} ${amount}\n\nCCAvenue has sent the invoice to your ${deliveryLabel}. You can also pay directly here:\n${billResult.tinyUrl}\n\n_Invoice valid for ${validFor} day${validFor === 1 ? "" : "s"} · Ref: ${order.orderNumber}_`;

    const waRes = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to:                conversation.waId,
          type:              "text",
          text:              { body: messageText },
        }),
      },
    );

    const waJson = await waRes.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message: string } };
    const waMessageId = waJson.messages?.[0]?.id ?? null;

    const now = new Date();
    await prisma.$transaction([
      prisma.message.create({
        data: {
          id:             crypto.randomUUID(),
          conversationId: id,
          waMessageId,
          direction:      "OUTBOUND",
          messageStatus:  "SENT",
          body:           messageText,
          sentById:       actor.id,
          createdAt:      now,
        },
      }),
      prisma.conversation.update({
        where: { id },
        data:  {
          lastMessageAt:    now,
          lastMessageBody:  `💳 Payment request: ${currency} ${amount}`,
          lastHumanReplyAt: now,
          botPaused:        true,
          status:           "OPEN",
        },
      }),
    ]);

    // Update order with CCAvenue invoice ID
    await prisma.order.update({
      where: { id: order.id },
      data:  { paymentGatewayRef: billResult.invoiceId },
    }).catch(() => {});

    pgNotify({ type: "message_new", conversationId: id, waId: conversation.waId }).catch(() => {});

    return jsonOk({
      orderId:     order.id,
      orderNumber: order.orderNumber,
      invoiceId:   billResult.invoiceId,
      tinyUrl:     billResult.tinyUrl,
      reference:   referenceNo,
    }, 201);

  } catch (err) {
    return handleApiError(err);
  }
}
