import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set(["RECEIVED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]);

/** PATCH /api/operator/queue/[orderId]/status */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const user = await requireRole(["SUPER_ADMIN", "ADMIN", "OPERATOR"] as const);
    const { orderId } = await params;
    const body = await req.json().catch(() => ({})) as { status?: string };

    if (!body.status || !VALID.has(body.status)) return jsonError("Invalid status", 400);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderStatus: true, assignedOperatorId: true },
    });
    if (!order) return jsonError("Order not found", 404);

    // Operators can only update their own assigned orders
    if (user.role === "OPERATOR" && order.assignedOperatorId !== user.id) {
      return jsonError("Not your order", 403);
    }

    const oldStatus = order.orderStatus;
    const newStatus = body.status as typeof oldStatus;

    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data:  { orderStatus: newStatus },
      }),
      prisma.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus,
          newStatus,
          changedById: user.id,
        },
      }),
    ]);

    return jsonOk({ ok: true, status: newStatus });
  } catch (err) {
    return handleApiError(err);
  }
}
