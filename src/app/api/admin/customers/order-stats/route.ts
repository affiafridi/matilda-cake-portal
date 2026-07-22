import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api/http";
import type { OrderStat } from "@/lib/customerSegments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/customers/order-stats
 * Returns aggregated order stats per whatsapp number from the portal orders table.
 * Used client-side to compute customer segments without touching the bot DB.
 */
export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN", "ADMIN"] as const);

    const rows = await prisma.$queryRaw<{
      wa_id:            string;
      order_count:      bigint;
      total_spend:      number;
      last_order_days:  number | null;
    }[]>`
      SELECT
        "whatsappNumber"                                       AS wa_id,
        COUNT(*)::bigint                                       AS order_count,
        COALESCE(SUM("totalAmount"), 0)::float                AS total_spend,
        EXTRACT(DAY FROM NOW() - MAX("createdAt"))::int        AS last_order_days
      FROM orders
      WHERE "whatsappNumber" IS NOT NULL AND "whatsappNumber" != ''
      GROUP BY "whatsappNumber"
    `;

    const data: Record<string, OrderStat> = {};
    for (const r of rows) {
      data[r.wa_id] = {
        orderCount:         Number(r.order_count),
        totalSpend:         r.total_spend,
        daysSinceLastOrder: r.last_order_days ?? null,
      };
    }

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return handleApiError(err);
  }
}
