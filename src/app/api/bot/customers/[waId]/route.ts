import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ waId: string }> },
) {
  try {
    const { waId } = await params;

    const [customerRes, conversationsRes, handoffsRes] = await Promise.all([
      botQuery(
        `SELECT wa_id, name, language, first_seen, last_seen, total_messages
         FROM customers WHERE wa_id = $1`,
        [waId],
      ),
      botQuery(
        `SELECT id, wa_id, message, intent, bot_response, created_at
         FROM conversations WHERE wa_id = $1 ORDER BY created_at ASC`,
        [waId],
      ),
      botQuery(
        `SELECT id, wa_id, message, created_at
         FROM handoffs WHERE wa_id = $1 ORDER BY created_at DESC`,
        [waId],
      ),
    ]);

    if (customerRes.rows.length === 0) return jsonError("Customer not found", 404);

    return jsonOk({
      customer: customerRes.rows[0],
      conversations: conversationsRes.rows,
      handoffs: handoffsRes.rows,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
