import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const { rows } = await botQuery<{ id: number; wc_id: number; word: string; lang: string }>(
      `SELECT id, wc_id, word, lang FROM keywords ORDER BY wc_id, id`,
    );

    return jsonOk(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const body = await req.json() as { wc_id?: number; word?: string; lang?: string };
    const { wc_id, word, lang } = body;

    if (!wc_id || !word?.trim()) return jsonError("wc_id and word are required", 400);
    const safeLang = lang === "ar" ? "ar" : "en";

    const { rows } = await botQuery<{ id: number; wc_id: number; word: string; lang: string }>(
      `INSERT INTO keywords (wc_id, word, lang)
       VALUES ($1, $2, $3)
       ON CONFLICT (wc_id, word) DO NOTHING
       RETURNING id, wc_id, word, lang`,
      [wc_id, word.trim(), safeLang],
    );

    if (rows.length === 0) return jsonError("Keyword already exists", 409);
    return jsonOk(rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}
