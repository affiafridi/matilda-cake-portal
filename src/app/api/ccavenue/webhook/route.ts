import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";
import { decryptCCAvenueWebhook } from "@/lib/ccavenue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ccavenue/webhook
 * CCAvenue calls this after payment success, failure, or cancellation.
 * The body is a URL-encoded form with an encrypted `encResp` field.
 *
 * Flow:
 * 1. Decrypt encResp using working key
 * 2. Find order by paymentGatewayOrderId
 * 3. Update paymentStatus + paymentGatewayRef + paymentGatewayStatus + paidAt
 * 4. Notify bot to send WhatsApp confirmation to customer
 */
export async function POST(req: NextRequest) {
  try {
    const { ccavenue_working_key, bot_url, inbox_webhook_secret } = await getIntegrations();

    if (!ccavenue_working_key) return jsonError("CCAvenue not configured", 500);

    // CCAvenue sends application/x-www-form-urlencoded
    const formText = await req.text();
    const params   = new URLSearchParams(formText);
    const encResp  = params.get("encResp");

    if (!encResp) return jsonError("Missing encResp", 400);

    // Decrypt the response
    let webhookData;
    try {
      webhookData = decryptCCAvenueWebhook(encResp, ccavenue_working_key);
    } catch {
      return jsonError("Failed to decrypt CCAvenue response", 400);
    }

    const { order_id, tracking_id, bank_ref_no, order_status, amount } = webhookData;

    if (!order_id) return jsonError("Missing order_id in response", 400);

    const SELECT_ORDER = {
      id:             true,
      orderNumber:    true,
      trackingCode:   true,
      whatsappNumber: true,
      customerName:   true,
      paymentStatus:  true,
      orderStatus:    true,
      totalAmount:    true,
      deliveryDate:   true,
      deliveryTime:   true,
    } as const;

    // Primary lookup: our reference_no stored as paymentGatewayOrderId
    // Fallback: CCAvenue Quick Bill sends invoice_id as order_id — stored in paymentGatewayRef
    let order = await prisma.order.findFirst({
      where:  { paymentGatewayOrderId: order_id },
      select: SELECT_ORDER,
    });
    if (!order) {
      order = await prisma.order.findFirst({
        where:  { paymentGatewayRef: order_id },
        select: SELECT_ORDER,
      });
    }

    if (!order) {
      console.error(`[ccavenue/webhook] Order not found for gateway order ID: ${order_id}`);
      return jsonError("Order not found", 404);
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

    // Idempotency — CCAvenue can call the webhook more than once
    if (order.paymentStatus === "PAID") {
      return NextResponse.redirect(`${appUrl}/orders/${order.trackingCode}?payment=Success`, 303);
    }

    // Determine payment status from CCAvenue response
    const isSuccess  = order_status === "Success";
    const isAborted  = order_status === "Aborted";
    const newPaymentStatus = isSuccess ? "PAID" : "UNPAID";

    // Update order
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus:       newPaymentStatus,
        paymentGatewayRef:   tracking_id || bank_ref_no || null,
        paymentGatewayStatus: order_status,
        ...(isSuccess ? { paidAt: new Date() } : {}),
        // Auto-confirm order on successful payment
        ...(isSuccess ? { orderStatus: "CONFIRMED" } : {}),
      },
    });

    // Write status history entry on success
    if (isSuccess) {
      await prisma.orderStatusHistory.create({
        data: {
          orderId:   order.id,
          oldStatus: order.orderStatus,
          newStatus: "CONFIRMED",
          note:      `Auto-confirmed after CCAvenue payment. Tracking ID: ${tracking_id}`,
        },
      });
    }

    // Update lead stage: PAID on success, ABANDONED on abort/failure
    try {
      const leadByOrder = await prisma.whatsappLead.findFirst({
        where: { orderId: order.id },
      });
      if (leadByOrder) {
        await prisma.whatsappLead.update({
          where: { id: leadByOrder.id },
          data:  { stage: isSuccess ? "PAID" : "ABANDONED", updatedAt: new Date() },
        });
      }
    } catch { /* don't fail the webhook for lead tracking */ }

    // Notify bot to send WhatsApp message to customer
    if (order.whatsappNumber && bot_url && inbox_webhook_secret) {
      const waId     = order.whatsappNumber;
      const trackUrl = `${appUrl}/orders/${order.trackingCode}`;

      let message: string;
      if (isSuccess) {
        message = `✅ *Payment Confirmed!*\n\nThank you, ${order.customerName}! Your payment of ${amount} has been received.\n\n*Order:* ${order.orderNumber}\n*Delivery:* ${order.deliveryDate ? new Date(order.deliveryDate).toDateString() : ""} at ${order.deliveryTime ?? ""}\n\nTrack your order: ${trackUrl}`;
      } else if (isAborted) {
        message = `⚠️ Payment was cancelled for order ${order.orderNumber}. If you'd like to try again, please let us know.`;
      } else {
        message = `❌ Payment failed for order ${order.orderNumber}. Please try again or contact us for help.`;
      }

      // Call bot to send WA message
      fetch(`${bot_url}/send-message`, {
        method:  "POST",
        headers: {
          "Content-Type":    "application/json",
          "x-sync-secret":   inbox_webhook_secret,
        },
        body: JSON.stringify({ waId, message }),
      }).catch((err) => console.error("[ccavenue/webhook] Failed to notify bot:", err));
    }

    // Redirect the customer's browser to a result page
    const resultParam = isSuccess ? "Success" : isAborted ? "Aborted" : "Failure";
    return NextResponse.redirect(
      `${appUrl}/orders/${order.trackingCode}?payment=${resultParam}`,
      303,
    );

  } catch (err) {
    return handleApiError(err);
  }
}
