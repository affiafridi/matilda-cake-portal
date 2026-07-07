import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { clearGoogleTokens } from "@/lib/googlesheets";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    await clearGoogleTokens();
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
