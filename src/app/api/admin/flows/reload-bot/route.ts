import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/flows/reload-bot
 * Tells the Python bot to reload its flow config from the portal DB.
 * Bot must expose POST /api/reload-config authenticated with x-inbox-secret.
 */
export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const { bot_url, inbox_webhook_secret } = await getIntegrations();
    if (!bot_url) return jsonError("BOT_URL not configured in integrations", 400);

    const res = await fetch(`${bot_url}/api/reload-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-inbox-secret": inbox_webhook_secret },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return jsonError(`Bot returned ${res.status}: ${text}`, 502);
    }

    const body = await res.json().catch(() => ({}));
    return jsonOk({ message: "Bot reloaded flows successfully", bot: body });
  } catch (err) {
    return handleApiError(err);
  }
}
