import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESUME_AFTER_HOURS = 24;

/**
 * GET /api/inbox/cron-resume
 *
 * Resets botPaused = false for any paused conversation where the last human
 * reply was more than RESUME_AFTER_HOURS ago. Run this hourly via Cloud
 * Scheduler (or any cron) with the CRON_SECRET header.
 */
export async function GET(req: Request) {
  const secret = req.headers ? new Headers(req.headers).get("x-cron-secret") : null;
  if (!secret || secret !== process.env.CRON_SECRET) {
    return jsonError("Unauthorized", 401);
  }

  const cutoff = new Date(Date.now() - RESUME_AFTER_HOURS * 60 * 60 * 1000);

  const { count } = await prisma.conversation.updateMany({
    where: {
      botPaused:        true,
      lastHumanReplyAt: { lt: cutoff },
    },
    data: { botPaused: false },
  });

  return jsonOk({ resumed: count });
}
