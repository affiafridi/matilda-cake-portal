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

    const { rows } = await botQuery<{ id: number; prompt: string; updated_at: string }>(
      `SELECT id, prompt, updated_at FROM ai_config ORDER BY id LIMIT 1`,
    );

    if (rows.length === 0) return jsonOk({ prompt: "" });
    return jsonOk(rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const body = await req.json() as { prompt?: string };
    if (typeof body.prompt !== "string") return jsonError("prompt is required", 400);

    const { rows } = await botQuery<{ id: number; prompt: string; updated_at: string }>(
      `UPDATE ai_config SET prompt = $1, updated_at = NOW()
       WHERE id = (SELECT id FROM ai_config ORDER BY id LIMIT 1)
       RETURNING id, prompt, updated_at`,
      [body.prompt],
    );

    if (rows.length === 0) return jsonError("ai_config table is empty — insert a row first", 500);
    return jsonOk(rows[0]);
  } catch (err) {
    return handleApiError(err);
  }
}
