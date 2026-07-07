import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthUrl, isOAuthConfigured } from "@/lib/googlesheets";
import { jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);
  if (!(await isOAuthConfigured())) return jsonError("Google OAuth credentials not configured. Go to Integrations → Google OAuth to add them.", 400);

  return NextResponse.redirect(await getAuthUrl());
}
