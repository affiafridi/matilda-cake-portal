import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import { exportAllCustomers, getGoogleConnection } from "@/lib/googlesheets";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const conn = await getGoogleConnection();
    if (!conn.connected) return jsonError("Google account not connected. Please connect your Google account in Integrations → Google Sheets.", 400);
    if (!conn.sheetId)   return jsonError("No Google Sheet selected. Paste your sheet URL in Integrations → Google Sheets and click Connect.", 400);

    // Fetch all conversations (each unique waId = one contact)
    const conversations = await prisma.conversation.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        waId: true,
        customerName: true,
        createdAt: true,
        status: true,
        customer: { select: { phone: true, email: true } },
      },
    });

    const customers = conversations.map((c) => ({
      phone: c.waId,
      name: c.customerName,
      source: "WhatsApp",
      firstSeen: c.createdAt,
      status: c.status === "RESOLVED" ? "Resolved" : "Active",
    }));

    let sheetUrl: string;
    try {
      ({ sheetUrl } = await exportAllCustomers(customers));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: number | string })?.code;
      console.error("[export-sheets]", { code, msg, err });
      if (/invalid_grant|token|unauthorized|expired|revoked/i.test(msg)) {
        return jsonError("Google token expired or revoked. Disconnect and reconnect your Google account in Integrations → Google Sheets.", 401);
      }
      if (/forbidden|permission/i.test(msg) || code === 403 || String(code) === "403") {
        const { accountEmail } = await getGoogleConnection();
        const hint = accountEmail ? ` The connected account is ${accountEmail} — make sure the sheet is shared with that email as Editor.` : " Disconnect and reconnect your Google account, then make sure the sheet is shared with it as Editor.";
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
