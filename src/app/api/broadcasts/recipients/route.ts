import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/broadcasts/recipients
 * Bot calls this for each recipient after sending the template message.
 * Auth: x-inbox-secret header
 * Body: {
 *   broadcastId,
 *   waId,
 *   waMessageId?,    // Meta's wamid returned from send API — used to track status later
 *   customerName?,
 *   phone?,
 *   status?,         // "SENT" | "FAILED" (default "SENT")
 *   errorMsg?
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { inbox_webhook_secret: SECRET } = await getIntegrations();
    const secret = req.headers.get("x-inbox-secret");
    if (!SECRET || secret !== SECRET) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const { broadcastId, waId, waMessageId, customerName, phone, errorMsg } = body;
    const status: string = body.status ?? "SENT";

    if (!broadcastId || !waId) return jsonError("broadcastId and waId are required", 400);

    const now = new Date();
    const recipient = await prisma.broadcastRecipient.create({
      data: {
        broadcastId,
        waId,
        customerName: customerName ?? null,
        phone:        phone ?? null,
        waMessageId:  waMessageId ?? null,
        status:       status === "FAILED" ? "FAILED" : "SENT",
        errorMsg:     errorMsg ?? null,
        sentAt:       status !== "FAILED" ? now : null,
        failedAt:     status === "FAILED" ? now : null,
      },
      select: { id: true },
    });

    // Update broadcast aggregate counts
    if (status === "FAILED") {
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data:  { failedCount: { increment: 1 } },
      });
    } else {
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data:  { sentCount: { increment: 1 } },
      });
    }

    return jsonOk({ recipient });
  } catch (err) {
    console.error("[broadcasts/recipients]", err);
    return jsonError("Internal server error", 500);
  }
}
