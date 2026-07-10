import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { clearGoogleTokens } from "@/lib/googlesheets";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canAccess(user: { role: string } | null) {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role !== "ADMIN") return false;
  const rows = await prisma.$queryRaw<{ value: string }[]>`SELECT value FROM portal_settings WHERE key = 'integrations_visible_to_admin'`;
  return (rows[0]?.value ?? "false") === "true";
}

export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!await canAccess(user)) return jsonError("Forbidden", 403);

    await clearGoogleTokens();
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
