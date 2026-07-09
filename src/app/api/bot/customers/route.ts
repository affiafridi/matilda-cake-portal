import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Ensure tags column exists
    await botQuery(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'`).catch(() => {});

    const { searchParams } = new URL(req.url);
    const q      = searchParams.get("q")?.trim() ?? "";
    const tag    = searchParams.get("tag")?.trim() ?? "";
    const page   = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const offset = (page - 1) * limit;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      botQuery(
        `SELECT
           wa_id, name, language, first_seen, last_seen, total_messages,
           COALESCE(tags, '{}') AS tags
         FROM customers
         WHERE ($1 = '' OR name ILIKE $2 OR wa_id ILIKE $2)
           AND ($3 = '' OR $3 = ANY(tags))
         ORDER BY last_seen DESC
         LIMIT $4 OFFSET $5`,
        [q, `%${q}%`, tag, limit, offset],
      ),
      botQuery(
        `SELECT COUNT(*)::int AS total FROM customers
         WHERE ($1 = '' OR name ILIKE $2 OR wa_id ILIKE $2)
           AND ($3 = '' OR $3 = ANY(tags))`,
        [q, `%${q}%`, tag],
      ),
    ]);

    const total = countRows[0]?.total ?? 0;
    return jsonOk({ customers: rows, total, page, pages: Math.ceil(total / limit), limit });
  } catch (err) {
    return handleApiError(err);
  }
}
