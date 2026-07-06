import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — tell the bot to reload its in-memory category config from DB
export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const { bot_url: botUrl, sync_secret: secret } = await getIntegrations();
    if (!botUrl) return jsonError("BOT_URL not configured", 500);
    if (!secret) return jsonError("SYNC_SECRET not configured", 500);

    const res = await fetch(`${botUrl}/reload-config`, {
      method: "POST",
      headers: {
        "x-sync-secret": secret ?? "",
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return jsonError(`Bot reload failed (${res.status}): ${text}`, 502);
    }

    return jsonOk({ synced: true });
  } catch (err) {
    return handleApiError(err);
  }
}
