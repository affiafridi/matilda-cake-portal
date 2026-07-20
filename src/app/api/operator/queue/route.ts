import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { jsonOk, handleApiError } from "@/lib/api/http";
import { type OrderStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXCLUDED: OrderStatus[] = ["DELIVERED", "CANCELLED"];

/** GET /api/operator/queue — orders assigned to current operator (non-DELIVERED, non-CANCELLED) */
export async function GET() {
  try {
    const user = await requireRole(["SUPER_ADMIN", "ADMIN", "OPERATOR"] as const);

    // SUPER_ADMIN/ADMIN see all; OPERATOR sees only their own
    const where =
      user.role === "OPERATOR"
        ? { assignedOperatorId: user.id, orderStatus: { notIn: EXCLUDED } }
        : { orderStatus: { notIn: EXCLUDED } };

    const orders = await prisma.order.findMany({
      where,
      orderBy: [{ deliveryDate: "asc" }, { createdAt: "asc" }],
      take: 100,
      select: {
        id: true, orderNumber: true, trackingCode: true,
        customerName: true, customerPhone: true,
        orderItems: true, orderStatus: true, paymentStatus: true,
        totalAmount: true, deliveryDate: true, deliveryTime: true,
        branchName: true, notes: true,
      },
    });

    return jsonOk(orders.map((o) => ({
      ...o,
      totalAmount:  o.totalAmount  ? o.totalAmount.toString() : null,
      deliveryDate: o.deliveryDate.toISOString(),
    })));
  } catch (err) {
    return handleApiError(err);
  }
}
