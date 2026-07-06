import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

/**
 * GET /api/inbox/conversations/[id]/customer-orders
 * Returns the customer profile + their last 10 orders, looked up by
 * waId phone number or linked Customer record.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(ALLOWED);
    const { id } = await params;

    const conversation = await prisma.conversation.findUnique({
      where:  { id },
      select: { waId: true, customerName: true, customerId: true,
                customer: { select: { id: true, name: true, phone: true, email: true, whatsappNumber: true, createdAt: true } } },
    });

    if (!conversation) return jsonError("Conversation not found", 404);

    // Build order search: by linked customerId or by phone/whatsapp number
    const orderWhere = conversation.customerId
      ? { customerId: conversation.customerId }
      : {
          OR: [
            { customerPhone:   conversation.waId },
            { whatsappNumber:  conversation.waId },
          ],
        };

    const orders = await prisma.order.findMany({
      where:   orderWhere,
      orderBy: { createdAt: "desc" },
      take:    10,
      select: {
        id:            true,
        orderNumber:   true,
        trackingCode:  true,
        orderStatus:   true,
        paymentStatus: true,
        totalAmount:   true,
        deliveryDate:  true,
        createdAt:     true,
        branchName:    true,
      },
    });

    const serializedOrders = orders.map((o) => ({
      ...o,
      totalAmount:  o.totalAmount  ? o.totalAmount.toString()   : null,
      deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString() : null,
      createdAt:    o.createdAt.toISOString(),
    }));

    const rawCustomer = conversation.customer;
    const serializedCustomer = rawCustomer
      ? { ...rawCustomer, createdAt: rawCustomer.createdAt.toISOString() }
      : {
          id:             null,
          name:           conversation.customerName,
          phone:          conversation.waId,
          email:          null,
          whatsappNumber: conversation.waId,
          createdAt:      null,
        };

    return jsonOk({
      customer:   serializedCustomer,
      orders:     serializedOrders,
      totalOrders: serializedOrders.length,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
