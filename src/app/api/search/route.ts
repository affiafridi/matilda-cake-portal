import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return jsonOk({ orders: [], customers: [] });

    const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
    const orderFilter = user.role === "AGENT" ? { createdById: user.id } : {};

    const [orders, customers] = await Promise.all([
      prisma.order.findMany({
        where: {
          ...orderFilter,
          OR: [
            { orderNumber:   { contains: q, mode: "insensitive" } },
            { customerName:  { contains: q, mode: "insensitive" } },
            { trackingCode:  { contains: q, mode: "insensitive" } },
            { customerPhone: { contains: q } },
          ],
        },
        select: {
          id: true, orderNumber: true, trackingCode: true,
          customerName: true, totalAmount: true, orderStatus: true, paymentStatus: true,
          deliveryDate: true,
        },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      isAdmin
        ? prisma.conversation.findMany({
            where: {
              OR: [
                { customerName: { contains: q, mode: "insensitive" } },
                { waId:         { contains: q } },
              ],
            },
            select: { id: true, waId: true, customerName: true, lastMessageBody: true, unreadCount: true },
            take: 4,
            orderBy: { lastMessageAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

    return jsonOk({ orders, customers });
  } catch (err) {
    return handleApiError(err);
  }
}
