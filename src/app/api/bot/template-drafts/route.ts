import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENSURE = `
  CREATE TABLE IF NOT EXISTS template_drafts (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL DEFAULT 'MARKETING',
    language    TEXT NOT NULL DEFAULT 'en',
    header_type TEXT NOT NULL DEFAULT 'NONE',
    header_text TEXT,
    header_media JSONB,
    body        TEXT NOT NULL DEFAULT '',
    footer_text TEXT,
    buttons     JSONB NOT NULL DEFAULT '[]',
    examples    JSONB NOT NULL DEFAULT '[]',
    created_by  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  )
`;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);
    await botQuery(ENSURE);
    const { rows } = await botQuery(`SELECT * FROM template_drafts ORDER BY updated_at DESC`);
    return jsonOk(rows);
  } catch (err) { return handleApiError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);
    await botQuery(ENSURE);
    const b = await req.json();
    const { rows } = await botQuery(
      `INSERT INTO template_drafts (name, category, language, header_type, header_text, header_media, body, footer_text, buttons, examples, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [b.name ?? "", b.category ?? "MARKETING", b.language ?? "en", b.headerType ?? "NONE",
       b.headerText ?? null, JSON.stringify(b.headerMedia ?? {}), b.body ?? "",
       b.footerText ?? null, JSON.stringify(b.buttons ?? []), JSON.stringify(b.examples ?? []), user.name],
    );
    return jsonOk(rows[0]);
  } catch (err) { return handleApiError(err); }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);
    await botQuery(ENSURE);
    const b = await req.json();
    if (!b.id) return jsonError("id required", 400);
    const { rows } = await botQuery(
      `UPDATE template_drafts SET name=$1, category=$2, language=$3, header_type=$4, header_text=$5,
       header_media=$6, body=$7, footer_text=$8, buttons=$9, examples=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [b.name ?? "", b.category ?? "MARKETING", b.language ?? "en", b.headerType ?? "NONE",
       b.headerText ?? null, JSON.stringify(b.headerMedia ?? {}), b.body ?? "",
       b.footerText ?? null, JSON.stringify(b.buttons ?? []), JSON.stringify(b.examples ?? []), b.id],
    );
    return jsonOk(rows[0]);
  } catch (err) { return handleApiError(err); }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);
    const { id } = await req.json();
    if (!id) return jsonError("id required", 400);
    await botQuery(`DELETE FROM template_drafts WHERE id=$1`, [id]);
    return jsonOk({ deleted: true });
  } catch (err) { return handleApiError(err); }
}
