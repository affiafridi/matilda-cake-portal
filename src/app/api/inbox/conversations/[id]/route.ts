import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED        = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;
const VALID_STATUSES = new Set(["OPEN", "PENDING", "RESOLVED"]);

/** GET /api/inbox/conversations/[id] — conversation detail + messages */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(ALLOWED);
    const { id } = await params;

    const [conversation, messages] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id },
        select: {
          id: true, waId: true, customerName: true, status: true,
          botPaused: true, tags: true, lastInboundAt: true,
          unreadCount: true, lastMessageAt: true,
          assignedTo: { select: { id: true, name: true } },
          customer:   { select: { id: true, name: true, phone: true, email: true } },
        },
      }),
      prisma.message.findMany({
        where:   { conversationId: id },
        orderBy: { createdAt: "asc" },
        take:    100,
        select: {
          id: true, direction: true, body: true,
          mediaUrl: true, mediaType: true, messageStatus: true,
          waMessageId: true, createdAt: true,
          sentBy: { select: { id: true, name: true } },
        },
      }),
    ]);

    if (!conversation) return jsonError("Conversation not found", 404);

    // Reset unread count when agent opens conversation
    if (conversation.unreadCount > 0) {
      await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    }

    return jsonOk({ conversation, messages });
  } catch (err) {
    return handleApiError(err);
  }
}

/** PATCH /api/inbox/conversations/[id] — update status or assignment */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(ALLOWED);
    const { id } = await params;
    const body   = await req.json().catch(() => ({}));

    const data: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!VALID_STATUSES.has(body.status)) return jsonError("Invalid status", 400);
      data.status = body.status;
      // Resolving a conversation resumes the bot for next contact
      if (body.status === "RESOLVED") data.botPaused = false;
    }
    if ("assignedToId" in body) {
      data.assignedToId = body.assignedToId ?? null;
    }
    if (typeof body.botPaused === "boolean") {
      data.botPaused = body.botPaused;
    }
    if (Array.isArray(body.tags)) {
      data.tags = body.tags.filter((t: unknown) => typeof t === "string");
    }

    if (Object.keys(data).length === 0) return jsonError("Nothing to update", 400);

    const updated = await prisma.conversation.update({
      where:  { id },
      data,
      select: { id: true, status: true, assignedToId: true },
    });

    return jsonOk(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
