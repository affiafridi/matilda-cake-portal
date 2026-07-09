import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/notify-agent
 * Bot calls this when a handoff step is triggered.
 * Creates or updates the conversation with agentRequested=true so it appears in Team Inbox.
 * Bot is NOT paused — agent manually takes over via inbox.
 */
export async function POST(req: NextRequest) {
  try {
    const { inbox_webhook_secret } = await getIntegrations();
    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const { waId, customerName, message } = body as { waId?: string; customerName?: string; message?: string };
    if (!waId) return jsonError("waId is required", 400);

    const now = new Date();

    const conv = await prisma.conversation.upsert({
      where:  { waId },
      create: {
        waId,
        customerName:    customerName ?? "Unknown",
        agentRequested:  true,
        unreadCount:     1,
        lastMessageAt:   now,
        lastMessageBody: message ?? null,
      },
      update: {
        agentRequested:  true,
        customerName:    customerName ?? undefined,
        lastMessageAt:   now,
        // Only overwrite lastMessageBody if the bot supplied the trigger message
        ...(message ? { lastMessageBody: message } : {}),
        unreadCount:     { increment: 1 },
      },
      select: { id: true },
    });

    // Insert a system event message in the thread so agents see exactly what triggered the handoff
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SYSTEM = "SYSTEM" as any;
    if (message) {
      const existing = await prisma.message.findFirst({
        where: { conversationId: conv.id, direction: SYSTEM, body: message },
        select: { id: true },
      });
      if (!existing) {
        await prisma.message.create({
          data: {
            id:             crypto.randomUUID(),
            conversationId: conv.id,
            direction:      SYSTEM,
            body:           message,
            createdAt:      now,
          },
        });
      }
    }

    return jsonOk({ notified: true });
  } catch (err) {
    return handleApiError(err);
  }
}
