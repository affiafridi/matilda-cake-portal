import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/customers/[waId]
 * Deletes a customer and all their conversations + messages. SUPER_ADMIN only.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ waId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const { waId } = await params;

    const customer = await prisma.customer.findUnique({ where: { phone: waId }, select: { id: true } });
    if (!customer) return jsonError("Customer not found", 404);

    // Delete cascade: messages → events → conversations → customer
    const conversations = await prisma.conversation.findMany({
      where:  { waId },
      select: { id: true },
    });
    const convIds = conversations.map((c) => c.id);

    await prisma.$transaction([
      prisma.message.deleteMany({ where: { conversationId: { in: convIds } } }),
      prisma.conversationEvent.deleteMany({ where: { conversationId: { in: convIds } } }),
      prisma.conversation.deleteMany({ where: { id: { in: convIds } } }),
      prisma.customer.delete({ where: { phone: waId } }),
    ]);

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
