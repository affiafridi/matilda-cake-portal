import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { jsonOk, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentRow = {
  agent_id:              string;
  agent_name:            string;
  total_handled:         bigint;
  resolved:              bigint;
  open_count:            bigint;
  pending_count:         bigint;
  avg_response_minutes:  number | null;
};

/** GET /api/admin/reports/agents?from=ISO&to=ISO */
export async function GET(req: NextRequest) {
  try {
    await requireRole(["SUPER_ADMIN", "ADMIN"] as const);

    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to   = searchParams.get("to");

    const fromDate = from ? new Date(from) : (() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0,0,0,0); return d; })();
    const toDate   = to   ? new Date(to)   : (() => { const d = new Date(); d.setHours(23,59,59,999); return d; })();

    const rows = await prisma.$queryRaw<AgentRow[]>`
      WITH first_inbound AS (
        SELECT "conversationId", MIN("createdAt") AS first_at
        FROM "Message"
        WHERE direction = 'INBOUND'
        GROUP BY "conversationId"
      ),
      first_agent_reply AS (
        SELECT m."conversationId", MIN(m."createdAt") AS reply_at
        FROM "Message" m
        JOIN first_inbound fi ON fi."conversationId" = m."conversationId"
        WHERE m.direction = 'OUTBOUND'
          AND m."sentById" IS NOT NULL
          AND m."createdAt" > fi.first_at
        GROUP BY m."conversationId"
      ),
      conv_response AS (
        SELECT fi."conversationId",
          EXTRACT(EPOCH FROM (far.reply_at - fi.first_at)) / 60.0 AS response_minutes
        FROM first_inbound fi
        JOIN first_agent_reply far ON far."conversationId" = fi."conversationId"
      )
      SELECT
        u.id                                                             AS agent_id,
        u.name                                                           AS agent_name,
        COUNT(c.id)                                                      AS total_handled,
        COUNT(CASE WHEN c.status = 'RESOLVED' THEN 1 END)               AS resolved,
        COUNT(CASE WHEN c.status = 'OPEN'     THEN 1 END)               AS open_count,
        COUNT(CASE WHEN c.status = 'PENDING'  THEN 1 END)               AS pending_count,
        AVG(cr.response_minutes)                                         AS avg_response_minutes
      FROM "Conversation" c
      JOIN "User" u ON u.id = c."assignedToId"
      LEFT JOIN conv_response cr ON cr."conversationId" = c.id
      WHERE c."lastMessageAt" >= ${fromDate}
        AND c."lastMessageAt" <= ${toDate}
        AND c."assignedToId" IS NOT NULL
      GROUP BY u.id, u.name
      ORDER BY total_handled DESC
    `;

    // Also fetch total unassigned conversations in period for context
    const unassignedCount = await prisma.conversation.count({
      where: {
        assignedToId: null,
        lastMessageAt: { gte: fromDate, lte: toDate },
        OR: [{ botPaused: true }, { agentRequested: true }],
      },
    });

    return jsonOk({
      from: fromDate.toISOString(),
      to:   toDate.toISOString(),
      unassigned: unassignedCount,
      agents: rows.map((r) => ({
        agentId:             r.agent_id,
        agentName:           r.agent_name,
        totalHandled:        Number(r.total_handled),
        resolved:            Number(r.resolved),
        openCount:           Number(r.open_count),
        pendingCount:        Number(r.pending_count),
        avgResponseMinutes:  r.avg_response_minutes != null ? Math.round(Number(r.avg_response_minutes)) : null,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
