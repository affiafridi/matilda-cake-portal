import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { prisma } from "@/lib/prisma";
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
           wa_id, name, language, first_seen, last_seen,
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

    // Count real messages from portal DB — one query for all customers
    const waIds = (rows as { wa_id: string }[]).map((r) => r.wa_id);
    let msgCountMap: Record<string, number> = {};
    if (waIds.length > 0) {
      const convs = await prisma.conversation.findMany({
        where:  { waId: { in: waIds } },
        select: { waId: true, _count: { select: { messages: true } } },
      });
      msgCountMap = Object.fromEntries(convs.map((c) => [c.waId, c._count.messages]));
    }

    const customers = rows.map((r: { wa_id: string }) => ({
      ...r,
      total_messages: msgCountMap[r.wa_id] ?? 0,
    }));

    const total = countRows[0]?.total ?? 0;
    return jsonOk({ customers, total, page, pages: Math.ceil(total / limit), limit });
  } catch (err) {
    return handleApiError(err);
  }
}
