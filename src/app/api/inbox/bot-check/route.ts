import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/inbox/bot-check?waId=<phone>
 *
 * Called by the bot server before generating an AI response.
 * Returns { botPaused, status } so the bot can decide whether to reply.
 * Authenticated with the shared INBOX_WEBHOOK_SECRET header.
 */
export async function GET(req: NextRequest) {
  const { inbox_webhook_secret } = await getIntegrations();
  const secret = req.headers.get("x-inbox-secret");
  if (!secret || secret !== inbox_webhook_secret) {
    return jsonError("Unauthorized", 401);
  }

  const waId = req.nextUrl.searchParams.get("waId");
  if (!waId) return jsonError("waId is required", 400);

  const conversation = await prisma.conversation.findUnique({
    where:  { waId },
    select: { botPaused: true, status: true },
  });

  if (!conversation) {
    // No conversation yet — bot should respond normally
    return jsonOk({ botPaused: false, status: null });
  }

  return jsonOk({
    botPaused: conversation.botPaused,
    status:    conversation.status,
  });
}
