import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

/** GET /api/broadcasts/[id] — broadcast detail + paginated recipients */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(ALLOWED);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const page    = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit   = 50;
    const skip    = (page - 1) * limit;
    const status  = searchParams.get("status") ?? "";
    const search  = searchParams.get("search") ?? "";

    const broadcast = await prisma.broadcast.findUnique({
      where: { id },
      select: {
        id: true, name: true, templateName: true, templateLang: true,
        status: true, totalCount: true, sentCount: true,
        deliveredCount: true, readCount: true, failedCount: true,
        createdAt: true, completedAt: true,
        sentBy: { select: { id: true, name: true } },
      },
    });
    if (!broadcast) return jsonError("Broadcast not found", 404);

    const where: Record<string, unknown> = { broadcastId: id };
    if (status) where.status = status.toUpperCase();
    if (search) where.OR = [
      { customerName: { contains: search, mode: "insensitive" } },
      { phone:        { contains: search } },
      { waId:         { contains: search } },
    ];

    const [recipients, total] = await Promise.all([
      prisma.broadcastRecipient.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
        select: {
          id: true, waId: true, customerName: true, phone: true,
          status: true, errorMsg: true,
          sentAt: true, deliveredAt: true, readAt: true, failedAt: true,
          createdAt: true,
        },
      }),
      prisma.broadcastRecipient.count({ where }),
    ]);

    return jsonOk({ broadcast, recipients, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * PATCH /api/broadcasts/[id] — mark completed / update counts
 * Called by the bot when the send loop finishes.
 * Auth: x-inbox-secret header
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { inbox_webhook_secret: SECRET } = await getIntegrations();
    const secret = req.headers.get("x-inbox-secret");
    if (!SECRET || secret !== SECRET) return jsonError("Unauthorized", 401);

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (body.status)         data.status       = body.status;
    if (body.completedAt)    data.completedAt  = new Date(body.completedAt);
    if (typeof body.sentCount      === "number") data.sentCount      = body.sentCount;
    if (typeof body.deliveredCount === "number") data.deliveredCount = body.deliveredCount;
    if (typeof body.readCount      === "number") data.readCount      = body.readCount;
    if (typeof body.failedCount    === "number") data.failedCount    = body.failedCount;

    const updated = await prisma.broadcast.update({ where: { id }, data, select: { id: true } });
    return jsonOk({ broadcast: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
