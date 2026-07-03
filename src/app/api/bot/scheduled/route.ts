import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS scheduled_campaigns (
    id           SERIAL PRIMARY KEY,
    template_name     TEXT        NOT NULL,
    template_language TEXT        NOT NULL,
    customers    JSONB       NOT NULL,
    payload      JSONB       NOT NULL,
    send_at      TIMESTAMPTZ NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'pending',
    error        TEXT,
    created_by   TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  )
`;

const createSchema = z.object({
  templateName:     z.string().min(1),
  templateLanguage: z.string().default("en"),
  customers:        z.array(z.string()).min(1),
  sendAt:           z.string().datetime(),
  // optional campaign payload fields
  imageUrl:         z.string().optional(),
  headerFormat:     z.string().optional(),
  bodyVarCount:     z.number().int().min(0).default(0),
  extraBodyVars:    z.array(z.string()).default([]),
  urlSuffix:        z.string().optional(),
  urlButtonIndex:   z.number().int().optional(),
  couponCode:       z.string().optional(),
  couponButtonIndex:z.number().int().optional(),
});

// ── GET — list scheduled campaigns ────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    await botQuery(ENSURE_TABLE);

    const status = req.nextUrl.searchParams.get("status") ?? "pending";
    const rows = await botQuery(
      `SELECT id, template_name, template_language, customers, send_at, status, error, created_by, created_at
       FROM scheduled_campaigns
       WHERE status = $1
       ORDER BY send_at ASC
       LIMIT 50`,
      [status],
    );

    return jsonOk({ scheduled: rows.rows });
  } catch (err) {
    return handleApiError(err);
  }
}

// ── POST — create a scheduled campaign ────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    await botQuery(ENSURE_TABLE);

    const body   = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid request: " + parsed.error.issues[0]?.message, 400);

    const {
      templateName, templateLanguage, customers, sendAt,
      imageUrl, headerFormat, bodyVarCount, extraBodyVars,
      urlSuffix, urlButtonIndex, couponCode, couponButtonIndex,
    } = parsed.data;

    // Reject past dates
    if (new Date(sendAt) <= new Date()) {
      return jsonError("Schedule time must be in the future", 400);
    }

    const payload = {
      imageUrl, headerFormat, bodyVarCount, extraBodyVars,
      urlSuffix, urlButtonIndex, couponCode, couponButtonIndex,
    };

    const result = await botQuery(
      `INSERT INTO scheduled_campaigns
         (template_name, template_language, customers, payload, send_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [templateName, templateLanguage, JSON.stringify(customers), JSON.stringify(payload), sendAt, user.name],
    );

    return jsonOk({ id: result.rows[0].id, scheduledFor: sendAt });
  } catch (err) {
    return handleApiError(err);
  }
}

// ── DELETE — cancel a scheduled campaign ──────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const { id } = await req.json().catch(() => ({}));
    if (!id) return jsonError("id required", 400);

    await botQuery(
      `UPDATE scheduled_campaigns SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
      [id],
    );

    return jsonOk({ cancelled: true });
  } catch (err) {
    return handleApiError(err);
  }
}
