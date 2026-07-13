import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";
import { buildOrderNumber, buildTrackingCode } from "@/lib/orders/codes";
import { buildCCAvenueCheckoutUrl } from "@/lib/ccavenue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/orders
 * Called by the bot after the customer completes the WhatsApp checkout form.
 *
 * Body:
 * {
 *   waId:            string   — customer's WhatsApp number
 *   customerName:    string
 *   customerPhone:   string
 *   customerEmail?:  string
 *   deliveryAddress: string
 *   deliveryDate:    string   — ISO date e.g. "2026-07-20"
 *   deliveryTime:    string   — e.g. "3:00 PM"
 *   notes?:          string
 *   amount:          string   — total amount e.g. "250.00"
 *   currency?:       string   — default "AED"
 *   product: {
 *     name:          string
 *     price:         string
 *     woocommerceProductId?:   string
 *     woocommerceVariationId?: string
 *     variationName?:          string
 *   }
 * }
 *
 * Returns:
 * { orderId, orderNumber, trackingCode, paymentUrl }
 */
export async function POST(req: NextRequest) {
  try {
    const {
      inbox_webhook_secret,
      ccavenue_merchant_id,
      ccavenue_access_code,
      ccavenue_working_key,
      ccavenue_website_url,
    } = await getIntegrations();

    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => ({})) as {
      waId?:            string;
      customerName?:    string;
      customerPhone?:   string;
      customerEmail?:   string;
      deliveryAddress?: string;
      deliveryDate?:    string;
      deliveryTime?:    string;
      notes?:           string;
      amount?:          string;
      currency?:        string;
      product?: {
        name?:                    string;
        price?:                   string;
        woocommerceProductId?:    string;
        woocommerceVariationId?:  string;
        variationName?:           string;
      };
    };

    // Validate required fields
    const missing: string[] = [];
    if (!body.waId)            missing.push("waId");
    if (!body.customerName)    missing.push("customerName");
    if (!body.customerPhone)   missing.push("customerPhone");
    if (!body.deliveryAddress) missing.push("deliveryAddress");
    if (!body.deliveryDate)    missing.push("deliveryDate");
    if (!body.deliveryTime)    missing.push("deliveryTime");
    if (!body.amount)          missing.push("amount");
    if (!body.product?.name)   missing.push("product.name");
    if (missing.length) return jsonError(`Missing required fields: ${missing.join(", ")}`, 400);

    if (!ccavenue_merchant_id || !ccavenue_access_code || !ccavenue_working_key) {
      return jsonError("CCAvenue integration not configured", 500);
    }

    const appUrl = (ccavenue_website_url || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const currency = body.currency ?? "AED";
    const amount   = parseFloat(body.amount!).toFixed(2);

    // Generate a unique gateway order ID — used as reference in CCAvenue and webhook
    const paymentGatewayOrderId = `WA-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const MAX_RETRIES = 5;
    let order: Awaited<ReturnType<typeof prisma.order.create>> | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const orderNumber  = buildOrderNumber();
      const trackingCode = buildTrackingCode();

      try {
        order = await prisma.order.create({
          data: {
            orderNumber,
            trackingCode,
            customerName:    body.customerName!,
            customerPhone:   body.customerPhone!,
            whatsappNumber:  body.waId!,
            customerEmail:   body.customerEmail ?? null,
            deliveryDate:    new Date(body.deliveryDate!),
            deliveryTime:    body.deliveryTime!,
            deliveryAddress: body.deliveryAddress!,
            notes:           body.notes ?? null,
            orderItems:      body.product!.name!,
            paymentMethod:   "CCAVENUE",
            paymentStatus:   "UNPAID",
            totalAmount:     parseFloat(amount),
            source:          "WHATSAPP",
            paymentGatewayOrderId,
            items: body.product ? {
              create: {
                itemName:               body.product.name!,
                quantity:               1,
                unitPrice:              parseFloat(amount),
                totalPrice:             parseFloat(amount),
                woocommerceProductId:   body.product.woocommerceProductId  ?? null,
                woocommerceVariationId: body.product.woocommerceVariationId ?? null,
                variationName:          body.product.variationName          ?? null,
              },
            } : undefined,
          },
        });
        break;
      } catch (e: unknown) {
        const isPrismaUniqueError =
          e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002";
        if (isPrismaUniqueError && attempt < MAX_RETRIES - 1) continue;
        throw e;
      }
    }

    if (!order) throw new Error("Failed to create order after multiple attempts");

    // Build CCAvenue payment URL
    const paymentUrl = buildCCAvenueCheckoutUrl({
      orderId:        paymentGatewayOrderId,
      amount,
      currency,
      customerName:   body.customerName!,
      customerPhone:  body.customerPhone!,
      customerEmail:  body.customerEmail,
      billingAddress: body.deliveryAddress!,
      redirectUrl:    `${appUrl}/api/ccavenue/webhook`,
      cancelUrl:      `${appUrl}/api/ccavenue/webhook`,
      merchantId:     ccavenue_merchant_id,
      accessCode:     ccavenue_access_code,
      workingKey:     ccavenue_working_key,
      websiteUrl:     appUrl,
    });

    return jsonOk({
      orderId:       order.id,
      orderNumber:   order.orderNumber,
      trackingCode:  order.trackingCode,
      paymentUrl,
    }, 201);

  } catch (err) {
    return handleApiError(err);
  }
}
