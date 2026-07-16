import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";
import { buildOrderNumber, buildTrackingCode } from "@/lib/orders/codes";
import { buildCCAvenueCheckoutUrl } from "@/lib/ccavenue";
import {
  decryptFlowRequest,
  encryptFlowResponse,
  buildDeliveryDates,
  getAvailableTimeSlots,
  type FlowResponse,
} from "@/lib/wa-flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/flows/checkout
 *
 * WhatsApp Flows endpoint — Meta calls this on every screen interaction.
 * Requests and responses are encrypted with RSA + AES-128-GCM.
 *
 * Flow token (set by bot when triggering flow, base64-encoded JSON):
 * {
 *   waId:                    string
 *   customerName:            string
 *   productName:             string
 *   productPrice:            string   e.g. "250.00"
 *   currency?:               string   default "AED"
 *   woocommerceProductId?:   string
 *   woocommerceVariationId?: string
 *   variationName?:          string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const {
      flows_private_key,
      ccavenue_merchant_id,
      ccavenue_access_code,
      ccavenue_working_key,
      ccavenue_website_url,
    } = await getIntegrations();

    if (!flows_private_key) {
      return NextResponse.json({ error: "Flows not configured" }, { status: 500 });
    }

    const body = await req.json() as {
      encrypted_flow_data: string;
      encrypted_aes_key:   string;
      initial_vector:      string;
    };

    // Decrypt the request
    let decrypted;
    try {
      decrypted = decryptFlowRequest(body, flows_private_key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[flows/checkout] decryption error:", msg, "| key length:", flows_private_key.length, "| key start:", flows_private_key.slice(0, 40));
      return NextResponse.json({ error: "Decryption failed" }, { status: 400 });
    }

    const { payload, aesKey, iv } = decrypted;

    // Health check from Meta — response is just { data: { status: "active" } }
    if (payload.action === "ping") {
      const encrypted = encryptFlowResponse({ data: { status: "active" } } as never, aesKey, iv);
      return new NextResponse(encrypted, { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    // Parse the flow token — bot encodes product + customer info here
    let tokenData: {
      waId:                    string;
      customerName:            string;
      productName:             string;
      productPrice:            string;
      currency?:               string;
      woocommerceProductId?:   string;
      woocommerceVariationId?: string;
      variationName?:          string;
    };

    try {
      tokenData = JSON.parse(
        Buffer.from(payload.flow_token, "base64").toString("utf8"),
      );
    } catch {
      return NextResponse.json({ error: "Invalid flow_token" }, { status: 400 });
    }

    const dates = buildDeliveryDates(14);

    // ── INIT ────────────────────────────────────────────────────────────────
    if (payload.action === "INIT") {
      return sendEncrypted({
        version: "3.0",
        screen:  "ORDER",
        data: {
          date:            dates,
          is_date_enabled: true,
          time:            [],   // empty until date is picked
        },
      }, aesKey, iv);
    }

    // ── DATA EXCHANGE ────────────────────────────────────────────────────────
    if (payload.action === "data_exchange") {
      const d = (payload.data ?? {}) as Record<string, string>;
      const trigger = d.trigger;

      // Customer selected a date — return available time slots for that date
      if (trigger === "date_selected") {
        const slots = getAvailableTimeSlots(d.date);
        return sendEncrypted({
          version: "3.0",
          screen:  "ORDER",
          data: {
            date:            dates,
            is_date_enabled: true,
            time:            slots,
          },
        }, aesKey, iv);
      }

      // Customer filled details — build summary screen
      if (trigger === "review_order") {
        const dateLabel = dates.find((x) => x.id === d.date)?.title ?? d.date;
        const productLabel = tokenData.variationName
          ? `${tokenData.productName} (${tokenData.variationName})`
          : tokenData.productName;

        return sendEncrypted({
          version: "3.0",
          screen:  "SUMMARY",
          data: {
            product_summary:  `${productLabel}\n${tokenData.currency ?? "AED"} ${tokenData.productPrice}`,
            delivery_summary: `${dateLabel} at ${d.time}\n${d.delivery_address}`,
            customer_summary: `${d.name}\n${d.phone}${d.email ? `\n${d.email}` : ""}${d.notes ? `\n\n📝 ${d.notes}` : ""}`,
            // pass through for final submit
            date:             d.date,
            time:             d.time,
            delivery_address: d.delivery_address,
            name:             d.name,
            phone:            d.phone,
            email:            d.email ?? "",
            notes:            d.notes ?? "",
          },
        }, aesKey, iv);
      }

      // Customer confirmed — create order + return payment URL
      if (trigger === "confirm_order") {
        if (!ccavenue_merchant_id || !ccavenue_access_code || !ccavenue_working_key) {
          return sendEncrypted({
            version: "3.0",
            screen:  "ERROR",
            data:    { error: "Payment gateway not configured. Please contact us." },
          }, aesKey, iv);
        }

        const appUrl   = (ccavenue_website_url || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
        const currency = tokenData.currency ?? "AED";
        const amount   = parseFloat(tokenData.productPrice).toFixed(2);
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
                customerName:    d.name,
                customerPhone:   d.phone,
                whatsappNumber:  tokenData.waId,
                customerEmail:   d.email || null,
                deliveryDate:    new Date(d.date),
                deliveryTime:    d.time,
                deliveryAddress: d.delivery_address,
                notes:           d.notes || null,
                orderItems:      tokenData.productName,
                paymentMethod:   "CCAVENUE",
                paymentStatus:   "UNPAID",
                totalAmount:     parseFloat(amount),
                source:          "WHATSAPP",
                paymentGatewayOrderId,
                items: {
                  create: {
                    itemName:               tokenData.productName,
                    quantity:               1,
                    unitPrice:              parseFloat(amount),
                    totalPrice:             parseFloat(amount),
                    woocommerceProductId:   tokenData.woocommerceProductId   ?? null,
                    woocommerceVariationId: tokenData.woocommerceVariationId ?? null,
                    variationName:          tokenData.variationName           ?? null,
                  },
                },
              },
            });
            break;
          } catch (e: unknown) {
            const isUnique = e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002";
            if (isUnique && attempt < MAX_RETRIES - 1) continue;
            throw e;
          }
        }

        if (!order) throw new Error("Failed to create order");

        const paymentUrl = buildCCAvenueCheckoutUrl({
          orderId:        paymentGatewayOrderId,
          amount,
          currency,
          customerName:   d.name,
          customerPhone:  d.phone,
          customerEmail:  d.email || undefined,
          billingAddress: d.delivery_address,
          redirectUrl:    `${appUrl}/api/ccavenue/webhook`,
          cancelUrl:      `${appUrl}/api/ccavenue/webhook`,
          merchantId:     ccavenue_merchant_id,
          accessCode:     ccavenue_access_code,
          workingKey:     ccavenue_working_key,
          websiteUrl:     appUrl,
        });

        // Return terminal SUCCESS — bot receives payment_url in flow completion webhook
        return sendEncrypted({
          version: "3.0",
          screen:  "SUCCESS",
          data: {
            extension_message_response: {
              params: {
                flow_token:   payload.flow_token,
                payment_url:  paymentUrl,
                order_number: order.orderNumber,
                tracking_code: order.trackingCode,
              },
            },
          },
        }, aesKey, iv);
      }
    }

    // Fallback — return to ORDER screen
    return sendEncrypted({
      version: "3.0",
      screen:  "ORDER",
      data: {
        date:            dates,
        is_date_enabled: true,
        time:            [],
      },
    }, aesKey, iv);

  } catch (err) {
    return handleApiError(err);
  }
}

function sendEncrypted(response: FlowResponse, aesKey: Buffer, iv: Buffer) {
  const encrypted = encryptFlowResponse(response, aesKey, iv);
  return new NextResponse(encrypted, {
    status:  200,
    headers: { "Content-Type": "text/plain" },
  });
}
