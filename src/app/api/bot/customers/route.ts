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
    const q   = searchParams.get("q")?.trim() ?? "";
    const tag = searchParams.get("tag")?.trim() ?? "";

    const { rows } = await botQuery(
      `SELECT
         wa_id,
         name,
         language,
         first_seen,
         last_seen,
         total_messages,
         COALESCE(tags, '{}') AS tags
       FROM customers
       WHERE ($1 = '' OR name ILIKE $2 OR wa_id ILIKE $2)
         AND ($3 = '' OR $3 = ANY(tags))
       ORDER BY last_seen DESC
       LIMIT 200`,
      [q, `%${q}%`, tag],
    );

    return jsonOk(rows);
  } catch (err) {
    return handleApiError(err);
  }
}
