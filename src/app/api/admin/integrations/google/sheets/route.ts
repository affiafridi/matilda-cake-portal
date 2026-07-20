import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { saveSelectedSheet, getGoogleConnection, isOAuthConfigured, parseSheetId, validateSheetId } from "@/lib/googlesheets";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";

async function canAccess(user: { role: string } | null) {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role !== "ADMIN") return false;
  const rows = await prisma.$queryRaw<{ value: string }[]>`SELECT value FROM portal_settings WHERE key = 'integrations_visible_to_admin'`;
  return (rows[0]?.value ?? "false") === "true";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — returns connection status */
export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!await canAccess(user)) return jsonError("Forbidden", 403);

    const [connection, oauthConfigured] = await Promise.all([getGoogleConnection(), isOAuthConfigured()]);
    return jsonOk({
      connected:      connection.connected,
      oauthConfigured,
      sheetId:        connection.sheetId,
      sheetName:      connection.sheetName,
      accountEmail:   connection.accountEmail,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE — unlink the current sheet (keep Google account connected) */
export async function DELETE(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!await canAccess(user)) return jsonError("Forbidden", 403);

    await prisma.$executeRaw`DELETE FROM portal_settings WHERE key IN ('google_sheet_id', 'google_sheet_name')`;
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST — validate and save the sheet URL/ID the user pasted */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!await canAccess(user)) return jsonError("Forbidden", 403);

    const body = await req.json() as { url?: string; id?: string; name?: string };

    // If explicit id+name passed (legacy / direct), save directly
    if (body.id && body.name) {
      await saveSelectedSheet(body.id, body.name);
      return jsonOk({ id: body.id, name: body.name });
    }

    // New: user pasted a URL or sheet ID — validate via Sheets API
    const raw = body.url ?? body.id ?? "";
    if (!raw.trim()) return jsonError("Sheet URL or ID is required", 400);

    const sheetId = parseSheetId(raw);
    if (!sheetId) return jsonError("Could not parse a sheet ID from that URL", 400);

    // Try to validate via Sheets API; if token is expired/invalid, save anyway
    let sheetName = sheetId;
    try {
      sheetName = await validateSheetId(sheetId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Token/auth errors — tell user to reconnect
      if (/invalid_grant|token|unauthorized|forbidden|credentials|not connected/i.test(msg)) {
        return jsonError("Google account token expired. Please disconnect and reconnect your Google account, then try again.", 401);
      }
      // Sheet not found / permission denied on the specific sheet
      if (/not found|forbidden|403|404|permission/i.test(msg)) {
        return jsonError("Could not access that sheet. Make sure the sheet is shared with your Google account.", 403);
      }
      // Unknown error — save ID anyway, validation will happen on first sync
      console.warn("[sheets] validateSheetId failed, saving without name:", msg);
    }
    await saveSelectedSheet(sheetId, sheetName);
    return jsonOk({ id: sheetId, name: sheetName });
  } catch (err) {
    return handleApiError(err);
  }
}
