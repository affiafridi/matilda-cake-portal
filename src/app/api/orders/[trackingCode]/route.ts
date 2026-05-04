import type { NextRequest } from "next/server";
import { getOrderByTrackingCode } from "@/lib/orders/service";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";

/** GET /api/orders/[trackingCode] — fetch full order detail by tracking code. */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ trackingCode: string }> },
) {
  try {
    const { trackingCode } = await context.params;

    if (!trackingCode || typeof trackingCode !== "string") {
      return jsonError("Invalid tracking code", 400);
    }

    const order = await getOrderByTrackingCode(trackingCode);
    if (!order) {
      return jsonError("Order not found", 404);
    }

    return jsonOk(order);
  } catch (error) {
    return handleApiError(error);
  }
}
