import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { listUserSheets, saveSelectedSheet, getGoogleConnection, isOAuthConfigured } from "@/lib/googlesheets";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — returns connection status + list of user's sheets */
export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const [connection, oauthConfigured] = await Promise.all([getGoogleConnection(), isOAuthConfigured()]);
    if (!connection.connected) return jsonOk({ connected: false, oauthConfigured, sheets: [], sheetId: null, sheetName: null });

    const sheets = await listUserSheets();
    return jsonOk({ connected: true, oauthConfigured, sheets, sheetId: connection.sheetId, sheetName: connection.sheetName });
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST — saves the selected sheet */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const { id, name } = await req.json() as { id: string; name: string };
    if (!id || !name) return jsonError("id and name required", 400);

    await saveSelectedSheet(id, name);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
