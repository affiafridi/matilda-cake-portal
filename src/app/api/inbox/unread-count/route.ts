import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

/** GET /api/inbox/unread-count — total unread messages across all open conversations */
export async function GET() {
  try {
    await requireRole(ALLOWED);

    const result = await prisma.conversation.aggregate({
      where:  { status: { not: "RESOLVED" }, OR: [{ botPaused: true }, { agentRequested: true }] },
      _sum:   { unreadCount: true },
    });

    return jsonOk({ count: result._sum.unreadCount ?? 0 });
  } catch (err) {
    return handleApiError(err);
  }
}
