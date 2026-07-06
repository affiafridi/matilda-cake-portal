import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMINS = ["SUPER_ADMIN", "ADMIN"] as const;

/** PATCH /api/inbox/quick-replies/[id] */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(ADMINS);
    const { id } = await params;
    const body     = await req.json().catch(() => ({}));
    const data: Record<string, string> = {};
    if (body.shortcut) data.shortcut = body.shortcut.trim().toLowerCase().replace(/\s+/g, "_");
    if (body.body)     data.body     = body.body.trim();
    if (Object.keys(data).length === 0) return jsonError("Nothing to update", 400);

    try {
      const reply = await prisma.quickReply.update({ where: { id }, data });
      return jsonOk(reply);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return jsonError(`Shortcut "/${data.shortcut}" already exists`, 409);
      }
      throw err;
    }
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/inbox/quick-replies/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(ADMINS);
    const { id } = await params;
    await prisma.quickReply.delete({ where: { id } });
    return jsonOk({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
