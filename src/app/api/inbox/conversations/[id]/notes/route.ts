import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

/** GET /api/inbox/conversations/[id]/notes */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(ALLOWED);
    const { id } = await params;

    const notes = await prisma.internalNote.findMany({
      where:   { conversationId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, body: true, createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });

    return jsonOk(notes);
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST /api/inbox/conversations/[id]/notes */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(ALLOWED);
    const { id } = await params;
    const body  = await req.json().catch(() => ({}));
    const text  = (body.body ?? "").trim();
    if (!text) return jsonError("Note body is required", 400);

    const exists = await prisma.conversation.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return jsonError("Conversation not found", 404);

    const note = await prisma.internalNote.create({
      data: {
        id:             crypto.randomUUID(),
        conversationId: id,
        authorId:       actor.id,
        body:           text,
      },
      select: {
        id: true, body: true, createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });

    return jsonOk(note, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
