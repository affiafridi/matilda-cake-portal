import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

/** GET /api/broadcasts — paginated list with aggregate stats */
export async function GET(req: NextRequest) {
  try {
    await requireRole(ALLOWED);
    const { searchParams } = new URL(req.url);
    const page  = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = 20;
    const skip  = (page - 1) * limit;
    const search = searchParams.get("search") ?? "";
    const from   = searchParams.get("from");
    const to     = searchParams.get("to");

    const where: Record<string, unknown> = {};
    if (search) where.OR = [
      { name:         { contains: search, mode: "insensitive" as const } },
      { templateName: { contains: search, mode: "insensitive" as const } },
    ];
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lt:  new Date(to)   } : {}),
      };
    }

    const [broadcasts, total, agg] = await Promise.all([
      prisma.broadcast.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true, name: true, templateName: true, templateLang: true,
          status: true, totalCount: true, sentCount: true,
          deliveredCount: true, readCount: true, failedCount: true,
          createdAt: true, completedAt: true,
          sentBy: { select: { id: true, name: true } },
        },
      }),
      prisma.broadcast.count({ where }),
      prisma.broadcast.aggregate({
        where,
        _sum: {
          totalCount: true, sentCount: true,
          deliveredCount: true, readCount: true, failedCount: true,
        },
        _count: { id: true },
      }),
    ]);

    const totals = {
      campaigns:  agg._count.id              ?? 0,
      recipients: agg._sum.totalCount        ?? 0,
      sent:       agg._sum.sentCount         ?? 0,
      delivered:  agg._sum.deliveredCount    ?? 0,
      read:       agg._sum.readCount         ?? 0,
      failed:     agg._sum.failedCount       ?? 0,
    };

    return jsonOk({ broadcasts, total, page, pages: Math.ceil(total / limit), totals });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/broadcasts — create a new broadcast record
 * Called by the bot when it starts sending a campaign.
 * Auth: x-inbox-secret header (same secret used by bot webhook)
 * Body: { name, templateName, templateLang?, totalCount }
 */
export async function POST(req: NextRequest) {
  try {
    const { inbox_webhook_secret: SECRET } = await getIntegrations();
    const secret = req.headers.get("x-inbox-secret");
    if (!SECRET || secret !== SECRET) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const { name, templateName, templateLang = "en", totalCount = 0 } = body;
    if (!name || !templateName) return jsonError("name and templateName are required", 400);

    const broadcast = await prisma.broadcast.create({
      data: { name, templateName, templateLang, totalCount, status: "SENDING" },
      select: { id: true, name: true, templateName: true, createdAt: true },
    });

    return jsonOk({ broadcast });
  } catch (err) {
    return handleApiError(err);
  }
}
