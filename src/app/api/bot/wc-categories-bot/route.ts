import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/wc-categories-bot
 * Bot-facing endpoint — returns only enabled categories, ordered by sort_order.
 * Authenticated with x-inbox-secret header.
 */
export async function GET(req: NextRequest) {
  try {
    const { inbox_webhook_secret } = await getIntegrations();
    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) return jsonError("Unauthorized", 401);

    const { rows } = await botQuery<{ wc_id: number; name: string }>(
      `SELECT wc_id, name FROM bot_categories WHERE enabled = true ORDER BY sort_order, wc_id`,
    );

    return jsonOk({ categories: rows });
  } catch (err) {
    return handleApiError(err);
  }
}
