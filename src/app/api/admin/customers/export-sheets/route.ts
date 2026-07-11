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
      if (/invalid_grant|token|unauthorized|expired|revoked/i.test(msg)) {
        return jsonError("Google token expired. Please disconnect and reconnect your Google account in Integrations → Google Sheets.", 401);
      }
      if (/forbidden|permission|403/i.test(msg)) {
        return jsonError("Permission denied. Make sure your Google account has edit access to the sheet.", 403);
      }
      throw err;
    }

    return jsonOk({ count: customers.length, sheetUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
