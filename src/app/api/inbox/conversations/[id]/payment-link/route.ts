import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";
import { buildCCAvenueCheckoutUrl } from "@/lib/ccavenue";
import { buildOrderNumber, buildTrackingCode } from "@/lib/orders/codes";
import { pgNotify } from "@/lib/sse-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/**
 * POST /api/inbox/conversations/[id]/payment-link
 *
 * Generates a CCAvenue payment URL and sends it as a WhatsApp message.
 * The agent provides amount, currency, and a description.
 * An Order is created in the portal DB so the CCAvenue webhook can
 * mark it PAID automatically when the customer completes payment.
 *
 * Body: { amount: string, currency: string, description: string }
 *
 * Security:
 * - requireRole: only authenticated SUPER_ADMIN / ADMIN / AGENT
 * - CCAvenue working key is never sent to the browser
 * - Amount is validated server-side (positive number, max 2 decimal places)
 * - Conversation ownership is verified before sending
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(ALLOWED);
    const { id } = await params;

    const body = await req.json().catch(() => ({})) as {
      amount?:      string;
      currency?:    string;
      description?: string;
    };

    // ── Validate inputs ────────────────────────────────────────────────────
    const amountStr  = (body.amount ?? "").trim();
    const currency   = (body.currency ?? "AED").trim().toUpperCase();
    const description = (body.description ?? "").trim();

    if (!amountStr || !AMOUNT_RE.test(amountStr)) {
      return jsonError("Invalid amount — must be a positive number (e.g. 250 or 99.99)", 400);
    }
    const amountNum = parseFloat(amountStr);
    if (amountNum <= 0 || amountNum > 999_999) {
      return jsonError("Amount must be between 0.01 and 999,999", 400);
    }
    if (!description) return jsonError("Description is required", 400);
    if (description.length > 200) return jsonError("Description too long (max 200 chars)", 400);
    if (!["AED", "USD", "EUR", "GBP", "SAR", "INR"].includes(currency)) {
      return jsonError("Unsupported currency", 400);
    }

    // ── Load credentials (server-side only) ────────────────────────────────
    const {
      ccavenue_merchant_id,
      ccavenue_access_code,
      ccavenue_working_key,
      ccavenue_website_url,
      wa_phone_number_id: phoneNumberId,
      wa_access_token:   accessToken,
    } = await getIntegrations();

    if (!ccavenue_merchant_id || !ccavenue_access_code || !ccavenue_working_key) {
      return jsonError("CCAvenue integration not configured. Ask your admin to set it up in Integrations.", 503);
    }
    if (!phoneNumberId || !accessToken) {
      return jsonError("WhatsApp credentials not configured", 503);
    }

    // ── Verify conversation exists ─────────────────────────────────────────
    const conversation = await prisma.conversation.findUnique({
      where:  { id },
      select: { id: true, waId: true, customerName: true },
    });
    if (!conversation) return jsonError("Conversation not found", 404);

    const appUrl = (ccavenue_website_url || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const amount = amountNum.toFixed(2);

    // ── Reference: AGT-{AGENTNAME}-{TIMESTAMP}-{RANDOM} ───────────────────
    // Visible in CCAvenue dashboard so owner knows who created the invoice.
    const agentSlug = actor.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 10);
    const paymentGatewayOrderId = `AGT-${agentSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // ── Create Order in portal DB ──────────────────────────────────────────
    // Allows CCAvenue webhook to find and mark the order PAID automatically.
    // deliveryDate/Time/Address are required by the schema but not relevant
    // for agent-generated quick invoices — we use sensible placeholder values.
    const MAX_RETRIES = 5;
    let order: Awaited<ReturnType<typeof prisma.order.create>> | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        order = await prisma.order.create({
          data: {
            orderNumber:           buildOrderNumber(),
            trackingCode:          buildTrackingCode(),
            customerName:          conversation.customerName,
            customerPhone:         conversation.waId,
            whatsappNumber:        conversation.waId,
            deliveryDate:          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days placeholder
            deliveryTime:          "TBD",
            deliveryAddress:       "TBD",
            orderItems:            description,
            paymentMethod:         "CCAVENUE",
            paymentStatus:         "UNPAID",
            totalAmount:           amountNum,
            source:                "WHATSAPP",
            paymentGatewayOrderId,
            notes:                 `Quick invoice sent by agent: ${actor.name}`,
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

    // ── Build signed CCAvenue payment URL (working key stays server-side) ──
    const paymentUrl = buildCCAvenueCheckoutUrl({
      orderId:        paymentGatewayOrderId,
      amount,
      currency,
      customerName:   conversation.customerName,
      customerPhone:  conversation.waId,
      billingAddress: "N/A",
      redirectUrl:    `${appUrl}/api/ccavenue/webhook`,
      cancelUrl:      `${appUrl}/api/ccavenue/webhook`,
      merchantId:     ccavenue_merchant_id,
      accessCode:     ccavenue_access_code,
      workingKey:     ccavenue_working_key,
      websiteUrl:     appUrl,
    });

    // ── Build WhatsApp message ─────────────────────────────────────────────
    const messageText = `💳 *Payment Request*\n\n*${description}*\n*Amount:* ${currency} ${amount}\n\nClick the link below to pay securely:\n${paymentUrl}\n\n_Ref: ${order.orderNumber}_`;

    // ── Send via WhatsApp Cloud API ────────────────────────────────────────
    const waRes = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to:                conversation.waId,
          type:              "text",
          text:              { body: messageText },
        }),
      },
    );

    const waJson = await waRes.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message: string } };

    if (!waRes.ok) {
      // WhatsApp send failed — delete the order we just created so DB stays clean
      await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
      return jsonError(waJson.error?.message ?? "Failed to send WhatsApp message", 502);
    }

    const waMessageId = waJson.messages?.[0]?.id ?? null;
    const now = new Date();

    // ── Save outbound message to portal DB ────────────────────────────────
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

    pgNotify({ type: "message_new", conversationId: id, waId: conversation.waId }).catch(() => {});

    return jsonOk({
      orderId:     order.id,
      orderNumber: order.orderNumber,
      reference:   paymentGatewayOrderId,
    }, 201);

  } catch (err) {
    return handleApiError(err);
  }
}
