import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthUrl, isOAuthConfigured } from "@/lib/googlesheets";
import { jsonError } from "@/lib/api/http";
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

export async function GET() {
  const user = await getCurrentUser();
  if (!await canAccess(user)) return jsonError("Forbidden", 403);
  if (!(await isOAuthConfigured())) return jsonError("Google OAuth credentials not configured. Go to Integrations → Google OAuth to add them.", 400);

  return NextResponse.redirect(await getAuthUrl());
}
