import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

/** GET /api/admin/customers/[waId]/detail — orders, broadcasts, opt-out for a customer */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ waId: string }> }) {
  try {
    await requireRole(ALLOWED);
    const { waId } = await params;
    const decoded = decodeURIComponent(waId);

    const [conversation, orders, broadcasts] = await Promise.all([
      // Opt-out status + inbox conversation info
      prisma.conversation.findUnique({
        where:  { waId: decoded },
        select: {
          id: true, status: true, botPaused: true, agentRequested: true,
          broadcastOptOut: true, broadcastOptOutAt: true,
          lastMessageAt: true, unreadCount: true, channel: true,
          assignedTo: { select: { id: true, name: true } },
        },
      }),

      // Order history from portal DB
      prisma.order.findMany({
        where: {
          OR: [
            { customerPhone:  decoded },
            { whatsappNumber: decoded },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, orderNumber: true, trackingCode: true,
          orderStatus: true, paymentStatus: true,
          totalAmount: true, deliveryDate: true, createdAt: true,
          branchName: true, orderItems: true,
        },
      }),

      // Broadcast history
      prisma.broadcastRecipient.findMany({
        where:   { waId: decoded },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, status: true, sentAt: true, deliveredAt: true,
          readAt: true, failedAt: true, errorMsg: true, createdAt: true,
          broadcast: { select: { id: true, name: true, templateName: true, createdAt: true } },
        },
      }),
    ]);

    return jsonOk({
      conversation: conversation ? {
        ...conversation,
        broadcastOptOutAt: conversation.broadcastOptOutAt?.toISOString() ?? null,
        lastMessageAt:     conversation.lastMessageAt?.toISOString() ?? null,
      } : null,
      orders: orders.map((o) => ({
        ...o,
        totalAmount:  o.totalAmount  ? o.totalAmount.toString() : null,
        deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString() : null,
        createdAt:    o.createdAt.toISOString(),
      })),
      broadcasts: broadcasts.map((b) => ({
        ...b,
        sentAt:      b.sentAt?.toISOString()      ?? null,
        deliveredAt: b.deliveredAt?.toISOString() ?? null,
        readAt:      b.readAt?.toISOString()       ?? null,
        failedAt:    b.failedAt?.toISOString()    ?? null,
        createdAt:   b.createdAt.toISOString(),
        broadcast: {
          ...b.broadcast,
          createdAt: b.broadcast.createdAt.toISOString(),
        },
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
