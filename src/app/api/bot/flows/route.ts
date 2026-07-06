import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/flows
 * Bot fetches active flows on startup and /reload-config.
 * Authenticated with x-inbox-secret header.
 */
export async function GET(req: NextRequest) {
  try {
    const { inbox_webhook_secret } = await getIntegrations();
    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) return jsonError("Unauthorized", 401);

    const flows = await prisma.botFlow.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        steps: {
          orderBy: { sortOrder: "asc" },
          include: { options: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });

    return jsonOk(flows);
  } catch (err) {
    return handleApiError(err);
  }
}
