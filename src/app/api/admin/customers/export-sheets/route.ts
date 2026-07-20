import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { botQuery } from "@/lib/botdb";
import { exportAllCustomers, getGoogleConnection } from "@/lib/googlesheets";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const conn = await getGoogleConnection();
    if (!conn.connected) return jsonError("Google account not connected. Please connect your Google account in Integrations → Google Sheets.", 400);
    if (!conn.sheetId)   return jsonError("No Google Sheet selected. Paste your sheet URL in Integrations → Google Sheets and click Connect.", 400);

    // Optional: array of waIds to export only selected contacts
    const body = await req.json().catch(() => ({})) as { waIds?: string[] };
    const selectedIds = Array.isArray(body.waIds) && body.waIds.length > 0 ? body.waIds : null;

    // Query the bot customers table — same source as the Customers page UI.
    // Exclude Instagram contacts (ig_ prefix). Filter to selected waIds if provided.
    let rows: { wa_id: string; name: string; first_seen: string | null }[];
    if (selectedIds) {
      const result = await botQuery(
        `SELECT wa_id, name, first_seen FROM customers
         WHERE wa_id NOT LIKE 'ig\\_%' AND wa_id = ANY($1::text[])
         ORDER BY first_seen ASC`,
        [selectedIds],
      );
      rows = result.rows as typeof rows;
    } else {
      const result = await botQuery(
        `SELECT wa_id, name, first_seen FROM customers
         WHERE wa_id NOT LIKE 'ig\\_%'
         ORDER BY first_seen ASC`,
      );
      rows = result.rows as typeof rows;
    }

    const customers = rows.map((r) => ({
      phone:     r.wa_id,
      name:      r.name ?? r.wa_id,
      source:    "WhatsApp",
      firstSeen: r.first_seen ? new Date(r.first_seen) : undefined,
    }));

    let sheetUrl: string;
    try {
      ({ sheetUrl } = await exportAllCustomers(customers));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: number | string })?.code;
      console.error("[export-sheets]", { code, msg, err });
      if (/sheets-api-disabled/i.test(msg)) {
        return jsonError(msg.replace("sheets-api-disabled: ", ""), 403);
      }
      if (/invalid_grant|token|unauthorized|expired|revoked/i.test(msg)) {
        return jsonError("Google token expired or revoked. Disconnect and reconnect your Google account in Integrations → Google Sheets.", 401);
      }
      if (/forbidden|permission/i.test(msg) || code === 403 || String(code) === "403") {
        const { accountEmail } = await getGoogleConnection();
        const hint = accountEmail
          ? ` Connected as ${accountEmail} — make sure this sheet is shared with that email as Editor.`
          : " Disconnect and reconnect your Google account, then share the sheet with it as Editor.";
        return jsonError(`Permission denied (403).${hint}`, 403);
      }
      if (/not found|404/i.test(msg) || code === 404 || String(code) === "404") {
        return jsonError("Sheet not found. The spreadsheet ID may be wrong or the sheet was deleted.", 404);
      }
      return jsonError(`Export failed: ${msg}`, 500);
    }

    return jsonOk({ count: customers.length, sheetUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
