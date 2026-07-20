import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

/** GET /api/inbox/unread-count — total unread messages across all open conversations (WA + IG) */
export async function GET() {
  try {
    await requireRole(ALLOWED);

    const baseWhere = { status: { not: "RESOLVED" }, OR: [{ botPaused: true }, { agentRequested: true }] } as const;

    const [all, ig] = await Promise.all([
      prisma.conversation.aggregate({ where: baseWhere, _sum: { unreadCount: true } }),
      prisma.conversation.aggregate({ where: { ...baseWhere, channel: "instagram" }, _sum: { unreadCount: true } }),
    ]);

    const total = all._sum.unreadCount ?? 0;
    const igCount = ig._sum.unreadCount ?? 0;

    return jsonOk({ count: total, wa: total - igCount, ig: igCount });
  } catch (err) {
    return handleApiError(err);
  }
}
