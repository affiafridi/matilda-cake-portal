import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { botQuery } from "@/lib/botdb";
import { sendCampaign, createBroadcastRecord } from "@/lib/wa/sendCampaign";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import { z } from "zod";

export const runtime    = "nodejs";
export const dynamic    = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  customers:         z.array(z.string()).min(1),
  templateName:      z.string().min(1),
  templateLanguage:  z.string().default("en"),
  campaignName:      z.string().optional(),
  imageUrl:          z.string().optional(),
  headerHandle:      z.string().optional(),
  headerUrl:         z.string().optional(),
  headerFormat:      z.string().optional(),
  bodyVarCount:      z.number().int().min(0).default(0),
  extraBodyVars:     z.array(z.string()).default([]),
  urlSuffix:         z.string().optional(),
  urlIsWaId:         z.boolean().optional(),
  urlButtonIndex:    z.number().int().optional(),
  couponCode:        z.string().optional(),
  couponButtonIndex: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);
    if (!["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

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

    const { customers, templateName, templateLanguage, campaignName } = parsed.data;
    const name = campaignName ?? templateName;

    // Pre-flight: check for opted-out customers before creating any record
    const optedOutCheck = await prisma.conversation.findMany({
      where: { waId: { in: customers }, broadcastOptOutAt: { not: null } },
      select: { waId: true },
    }).catch(() => [] as { waId: string }[]);
    const optedOutIds = new Set(optedOutCheck.map((c) => c.waId));
    const activeCount = customers.filter((id) => !optedOutIds.has(id)).length;

    if (activeCount === 0) {
      const n = customers.length;
      return jsonError(
        n === 1
          ? "This customer has unsubscribed from broadcast messages and cannot be reached."
          : `All ${n} selected customers have unsubscribed from broadcast messages. No messages were sent.`,
        400,
      );
    }

    // Create the broadcast record immediately so we can return the ID right away
    const broadcastId = await createBroadcastRecord(name, templateName, templateLanguage, customers.length);

    // Fire-and-forget: send runs in the background while admin is redirected
    void sendCampaign({ ...parsed.data, broadcastId }).catch(async () => {
      // If sendCampaign throws unexpectedly, mark the broadcast as failed so it doesn't hang
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: "FAILED", completedAt: new Date() },
      }).catch(() => {});
    });

    return jsonOk({ broadcastId, status: "SENDING" });
  } catch (err) {
    return handleApiError(err);
  }
}
