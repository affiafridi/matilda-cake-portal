import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/paused?waId=971503298609
 * Bot checks this before processing a message — if paused, bot should skip.
 * Authenticated with x-inbox-secret header.
 */
export async function GET(req: NextRequest) {
  try {
    const { inbox_webhook_secret } = await getIntegrations();
    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) return jsonError("Unauthorized", 401);

    const waId = req.nextUrl.searchParams.get("waId");
    if (!waId) return jsonError("waId is required", 400);

    const conversation = await prisma.conversation.findFirst({
      where:  { waId },
      select: { botPaused: true },
    });

    return jsonOk({ paused: conversation?.botPaused ?? false });
  } catch (err) {
    return handleApiError(err);
  }
}
