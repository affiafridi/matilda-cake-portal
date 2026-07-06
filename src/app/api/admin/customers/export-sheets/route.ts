import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import { exportAllCustomers, isSheetsConfigured } from "@/lib/googlesheets";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    if (!isSheetsConfigured()) return jsonError("Google Sheets not configured. Add GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY to your environment.", 400);

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

    const { sheetUrl } = await exportAllCustomers(customers);

    return jsonOk({ count: customers.length, sheetUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
