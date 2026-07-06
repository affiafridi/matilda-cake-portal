import type { NextRequest } from "next/server";
import { jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/config
 * Kept for backward compatibility — proxies to bot's own /api/config.
 * Authenticated with the shared INBOX_WEBHOOK_SECRET header.
 */
export async function GET(req: NextRequest) {
  try {
    const { bot_url, inbox_webhook_secret } = await getIntegrations();
    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) return jsonError("Unauthorized", 401);

    if (!bot_url) return jsonError("BOT_URL not configured", 503);

    const res = await fetch(`${bot_url}/api/config`, {
      headers: { "x-inbox-secret": inbox_webhook_secret },
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
