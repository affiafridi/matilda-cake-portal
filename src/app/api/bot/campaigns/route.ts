import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENSURE_TABLE = `CREATE TABLE IF NOT EXISTS campaign_logs (
  id SERIAL PRIMARY KEY,
  template_name TEXT NOT NULL,
  template_language TEXT NOT NULL,
  total INTEGER NOT NULL,
  sent INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  results JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`;

export async function GET(req: NextRequest) {
  try {
    await botQuery(ENSURE_TABLE);

    const sp     = req.nextUrl.searchParams;
    const page   = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const limit  = 20;
    const offset = (page - 1) * limit;
    const search = sp.get("search")?.trim() ?? "";
    const from   = sp.get("from") ?? null;   // ISO date string
    const to     = sp.get("to")   ?? null;   // ISO date string

    // Build WHERE clause
    const conditions: string[] = [];
    const params: unknown[]    = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`template_name ILIKE $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at < $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows, count, stats, chart] = await Promise.all([
      // Paginated campaign rows
      botQuery(
        `SELECT id, template_name, template_language, total, sent, failed, results, created_at
         FROM campaign_logs ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      // Total count (filtered)
      botQuery(`SELECT COUNT(*)::int AS n FROM campaign_logs ${where}`, params),
      // Aggregate stats across ALL filtered rows (not just page)
      botQuery(
        `SELECT
           COUNT(*)::int            AS total_campaigns,
           COALESCE(SUM(total),0)::int  AS total_messages,
           COALESCE(SUM(sent),0)::int   AS total_sent,
           COALESCE(SUM(failed),0)::int AS total_failed
         FROM campaign_logs ${where}`,
        params,
      ),
      // Daily chart data (sent + failed grouped by day)
      botQuery(
        `SELECT
           DATE_TRUNC('day', created_at AT TIME ZONE 'UTC') AS day,
           COALESCE(SUM(sent),0)::int   AS sent,
           COALESCE(SUM(failed),0)::int AS failed,
           COUNT(*)::int                AS campaigns
         FROM campaign_logs ${where}
         GROUP BY day
         ORDER BY day`,
        params,
      ),
    ]);

    return jsonOk({
      logs:   rows.rows,
      total:  count.rows[0]?.n ?? 0,
      page,
      pages:  Math.ceil((count.rows[0]?.n ?? 0) / limit),
      stats:  stats.rows[0] ?? { total_campaigns: 0, total_messages: 0, total_sent: 0, total_failed: 0 },
      chart:  chart.rows,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json().catch(() => ({}));
    if (!id) return jsonError("id required", 400);
    await botQuery(`DELETE FROM campaign_logs WHERE id = $1`, [id]);
    return jsonOk({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
