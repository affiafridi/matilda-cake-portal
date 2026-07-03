import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureColumn() {
  // Add tags column to customers if it doesn't exist yet
  await botQuery(
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'`,
  );
}

const schema = z.object({
  wa_id: z.string().min(1),
  tags: z.array(z.string().min(1).max(30)).max(10),
});

// PUT — replace all tags for a customer
export async function PUT(req: NextRequest) {
  try {
    await ensureColumn();
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid request", 400);

    const { wa_id, tags } = parsed.data;
    // Normalise: lowercase, no duplicates
    const clean = Array.from(new Set(tags.map((t) => t.toLowerCase().trim()).filter(Boolean)));

    await botQuery(
      `UPDATE customers SET tags = $1 WHERE wa_id = $2`,
      [clean, wa_id],
    );
    return jsonOk({ wa_id, tags: clean });
  } catch (err) {
    return handleApiError(err);
  }
}

// GET — list all distinct tags in use
export async function GET() {
  try {
    await ensureColumn();
    const { rows } = await botQuery(
      `SELECT DISTINCT unnest(tags) AS tag FROM customers WHERE tags != '{}' ORDER BY 1`,
    );
    return jsonOk(rows.map((r) => (r as unknown as { tag: string }).tag));
  } catch (err) {
    return handleApiError(err);
  }
}
