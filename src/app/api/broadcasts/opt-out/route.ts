import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";
import { requireRole } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/broadcasts/opt-out?waId=xxx
 * Bot calls this before sending a broadcast message to check if the recipient opted out.
 * Auth: x-inbox-secret header
 */
export async function GET(req: NextRequest) {
  try {
    const { inbox_webhook_secret: SECRET } = await getIntegrations();
    const secret = req.headers.get("x-inbox-secret");
    if (!SECRET || secret !== SECRET) return jsonError("Unauthorized", 401);

    const waId = req.nextUrl.searchParams.get("waId");
    if (!waId) return jsonError("waId is required", 400);

    const conv = await prisma.conversation.findUnique({
      where:  { waId },
      select: { broadcastOptOut: true, broadcastOptOutAt: true },
    });

    return jsonOk({
      waId,
      optedOut:  conv?.broadcastOptOut ?? false,
      optedOutAt: conv?.broadcastOptOutAt ?? null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * GET /api/broadcasts/opt-out/list — portal UI: list all opted-out contacts
 * Auth: SUPER_ADMIN | ADMIN
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole(["SUPER_ADMIN", "ADMIN"] as const);
    const body = await req.json().catch(() => ({})) as { waIds?: string[] };

    // If waIds provided, return opt-out status for those specific contacts (bulk check)
    if (Array.isArray(body.waIds) && body.waIds.length > 0) {
      const convs = await prisma.conversation.findMany({
        where:  { waId: { in: body.waIds } },
        select: { waId: true, broadcastOptOut: true },
      });
      const map = Object.fromEntries(convs.map((c) => [c.waId, c.broadcastOptOut]));
      return jsonOk({ optOuts: map });
    }

    // Otherwise return full list of opted-out contacts
    const optedOut = await prisma.conversation.findMany({
      where:   { broadcastOptOut: true, channel: "whatsapp" },
      select:  { waId: true, customerName: true, broadcastOptOutAt: true },
      orderBy: { broadcastOptOutAt: "desc" },
    });

    return jsonOk({ optedOut, count: optedOut.length });
  } catch (err) {
    return handleApiError(err);
  }
}
