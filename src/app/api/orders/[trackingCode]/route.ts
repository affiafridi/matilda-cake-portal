import type { NextRequest } from "next/server";
import { getOrderByTrackingCode, updateOrder } from "@/lib/orders/service";
import { updateOrderSchema } from "@/lib/orders/schema";
import { requireUser } from "@/lib/auth/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";

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
    if (!order) return jsonError("Order not found", 404);
    return jsonOk(order);
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/orders/[trackingCode] — edit an existing order. */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ trackingCode: string }> },
) {
  try {
    const actor = await requireUser();
    const { trackingCode } = await context.params;
    if (!trackingCode || typeof trackingCode !== "string") {
      return jsonError("Invalid tracking code", 400);
    }
    const body = await req.json().catch(() => ({}));
    const input = updateOrderSchema.parse(body);
    const updated = await updateOrder({ trackingCode, actor, input });
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
