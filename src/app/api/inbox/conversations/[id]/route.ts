import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED        = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;
const VALID_STATUSES = new Set(["OPEN", "PENDING", "RESOLVED"]);

/** GET /api/inbox/conversations/[id] — conversation detail + messages + events */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(ALLOWED);
    const { id } = await params;

    const [conversation, messages, events] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id },
        select: {
          id: true, waId: true, customerName: true, status: true,
          botPaused: true, agentRequested: true, tags: true, lastInboundAt: true,
          unreadCount: true, lastMessageAt: true,
          currentBotFlowId: true, currentBotFlowName: true, currentBotStepKey: true,
          botContextVariables: true, lastBotActivityAt: true,
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
      prisma.conversationEvent.findMany({
        where:   { conversationId: id },
        orderBy: { createdAt: "asc" },
        take:    200,
        select: { id: true, type: true, actorName: true, meta: true, createdAt: true },
      }),
    ]);

    if (!conversation) return jsonError("Conversation not found", 404);

    // Reset unread count when agent opens conversation
    if (conversation.unreadCount > 0) {
      await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    }

    return jsonOk({ conversation, messages, events });
  } catch (err) {
    return handleApiError(err);
  }
}

/** PATCH /api/inbox/conversations/[id] — update status or assignment */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(ALLOWED);
    const { id } = await params;
    const body   = await req.json().catch(() => ({}));

    const data: Record<string, unknown> = {};

    // Snapshot current state for event logging
    const current = await prisma.conversation.findUnique({
      where:  { id },
      select: { status: true, assignedToId: true, botPaused: true, agentRequested: true },
    });

    if (body.status !== undefined) {
      if (!VALID_STATUSES.has(body.status)) return jsonError("Invalid status", 400);
      data.status = body.status;
      if (body.status === "RESOLVED") { data.botPaused = false; data.agentRequested = false; }
    }
    if ("assignedToId" in body) {
      data.assignedToId = body.assignedToId ?? null;
    }
    if (typeof body.botPaused === "boolean") {
      data.botPaused = body.botPaused;
    }
    if (typeof body.agentRequested === "boolean") {
      data.agentRequested = body.agentRequested;
    }
    if (Array.isArray(body.tags)) {
      data.tags = body.tags.filter((t: unknown) => typeof t === "string");
    }

    if (Object.keys(data).length === 0) return jsonError("Nothing to update", 400);

    const updated = await prisma.conversation.update({
      where:  { id },
      data,
      select: { id: true, status: true, assignedToId: true, assignedTo: { select: { id: true, name: true } } },
    });

    // Log activity events
    const eventsToCreate: { conversationId: string; type: string; actorName: string; meta?: string }[] = [];

    if (body.status !== undefined && current?.status !== body.status) {
      eventsToCreate.push({
        conversationId: id,
        type:      "STATUS_CHANGED",
        actorName: actor.name,
        meta:      JSON.stringify({ fromStatus: current?.status, toStatus: body.status }),
      });
    }

    if ("assignedToId" in body) {
      if (body.assignedToId && body.assignedToId !== current?.assignedToId) {
        const toAgent = updated.assignedTo;
        eventsToCreate.push({
          conversationId: id,
          type:      "ASSIGNED",
          actorName: actor.name,
          meta:      JSON.stringify({ toName: toAgent?.name ?? "someone" }),
        });
      } else if (!body.assignedToId && current?.assignedToId) {
        eventsToCreate.push({
          conversationId: id,
          type:      "UNASSIGNED",
          actorName: actor.name,
        });
      }
    }

    if (typeof body.botPaused === "boolean" && body.botPaused !== current?.botPaused) {
      eventsToCreate.push({
        conversationId: id,
        type:      body.botPaused ? "BOT_PAUSED" : "BOT_RESUMED",
        actorName: actor.name,
      });
    }

    if (eventsToCreate.length > 0) {
      await prisma.conversationEvent.createMany({ data: eventsToCreate });
    }

    return jsonOk(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
