import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENTS = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;
const ADMINS = ["SUPER_ADMIN", "ADMIN"] as const;

/** GET /api/inbox/quick-replies?q=search — all agents can fetch */
export async function GET(req: NextRequest) {
  try {
    await requireRole(AGENTS);
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    const replies = await prisma.quickReply.findMany({
      where: q ? {
        OR: [
          { shortcut: { contains: q, mode: "insensitive" } },
          { body:     { contains: q, mode: "insensitive" } },
        ],
      } : undefined,
      orderBy: { shortcut: "asc" },
    });

    return jsonOk(replies);
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST /api/inbox/quick-replies — admin only */
export async function POST(req: NextRequest) {
  try {
    await requireRole(ADMINS);
    const body     = await req.json().catch(() => ({}));
    const shortcut = (body.shortcut ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    const text     = (body.body ?? "").trim();
    if (!shortcut) return jsonError("Shortcut is required", 400);
    if (!text)     return jsonError("Body is required", 400);

    try {
      const reply = await prisma.quickReply.create({
        data: { id: crypto.randomUUID(), shortcut, body: text },
      });
      return jsonOk(reply, 201);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return jsonError(`Shortcut "/${shortcut}" already exists`, 409);
      }
      throw err;
    }
  } catch (err) {
    return handleApiError(err);
  }
}
