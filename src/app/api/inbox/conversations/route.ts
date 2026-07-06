import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

export async function GET(req: NextRequest) {
  try {
    const actor = await requireRole(ALLOWED);
    const { searchParams } = req.nextUrl;
    const status     = searchParams.get("status") ?? "OPEN";
    const assignedTo = searchParams.get("assignedTo");

    const where: Record<string, unknown> = {};
    if (status !== "ALL") where.status = status;
    if (assignedTo === "me")          where.assignedToId = actor.id;
    else if (assignedTo === "unassigned") where.assignedToId = null;

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      select: {
        id:              true,
        waId:            true,
        customerName:    true,
        status:          true,
        botPaused:       true,
        tags:            true,
        lastInboundAt:   true,
        unreadCount:     true,
        lastMessageAt:   true,
        lastMessageBody: true,
        assignedTo:      { select: { id: true, name: true } },
      },
    });

    return jsonOk(conversations);
  } catch (err) {
    return handleApiError(err);
  }
}
