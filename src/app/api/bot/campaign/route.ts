import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { botQuery } from "@/lib/botdb";
import { sendCampaign } from "@/lib/wa/sendCampaign";
import { getCurrentUser } from "@/lib/auth/server";
import { z } from "zod";

export const runtime    = "nodejs";
export const dynamic    = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  customers:         z.array(z.string()).min(1),
  templateName:      z.string().min(1),
  templateLanguage:  z.string().default("en"),
  imageUrl:          z.string().optional(),
  headerFormat:      z.string().optional(),
  bodyVarCount:      z.number().int().min(0).default(0),
  extraBodyVars:     z.array(z.string()).default([]),
  urlSuffix:         z.string().optional(),
  urlButtonIndex:    z.number().int().optional(),
  couponCode:        z.string().optional(),
  couponButtonIndex: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const body   = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid request", 400);

    // Ensure campaign_logs table exists
    await botQuery(`CREATE TABLE IF NOT EXISTS campaign_logs (
      id SERIAL PRIMARY KEY,
      template_name TEXT NOT NULL,
      template_language TEXT NOT NULL,
      total INTEGER NOT NULL,
      sent INTEGER NOT NULL,
      failed INTEGER NOT NULL,
      results JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});

    const result = await sendCampaign(parsed.data);
    if ("error" in result) return jsonError(result.error, 400);

    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
