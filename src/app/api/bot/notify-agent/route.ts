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
    const { waId, customerName } = body as { waId?: string; customerName?: string };
    if (!waId) return jsonError("waId is required", 400);

    await prisma.conversation.upsert({
      where:  { waId },
      create: {
        waId,
        customerName:   customerName ?? "Unknown",
        agentRequested: true,
        unreadCount:    1,
        lastMessageAt:  new Date(),
        lastMessageBody: "Customer requested an agent",
      },
      update: {
        agentRequested:  true,
        customerName:    customerName ?? undefined,
        lastMessageAt:   new Date(),
        lastMessageBody: "Customer requested an agent",
        unreadCount:     { increment: 1 },
      },
    });

    return jsonOk({ notified: true });
  } catch (err) {
    return handleApiError(err);
  }
}
