import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET — fetch all categories (DB state + optionally refresh from WooCommerce) ──
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const refresh = req.nextUrl.searchParams.get("refresh") === "true";

    // Always read current DB state
    const { rows: dbRows } = await botQuery<{
      wc_id: number; name: string; enabled: boolean; sort_order: number;
    }>(`SELECT wc_id, name, enabled, sort_order FROM bot_categories ORDER BY sort_order, wc_id`);

    const dbMap = new Map(dbRows.map((r) => [r.wc_id, r]));
    let newCount = 0;

    if (refresh) {
      const wcUrl = process.env.WOOCOMMERCE_URL;
      const key   = process.env.WOOCOMMERCE_CONSUMER_KEY;
      const sec   = process.env.WOOCOMMERCE_CONSUMER_SECRET;

      if (!wcUrl || !key || !sec) return jsonError("WooCommerce not configured", 500);

      const base     = wcUrl.replace(/\/$/, "");
      const fetchUrl = `${base}/wp-json/wc/v3/products/categories?per_page=100`;
      const res = await fetch(fetchUrl, {
        headers: { Authorization: "Basic " + Buffer.from(`${key}:${sec}`).toString("base64") },
        cache: "no-store",
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[wc-categories] WC error:", res.status, body.slice(0, 300));
        return jsonError("Failed to fetch categories from WooCommerce", 502);
      }

      const wcCats = await res.json() as { id: number; name: string; count: number }[];

      for (const cat of wcCats) {
        if (!dbMap.has(cat.id)) {
          // New category — insert with enabled=false, sort at end
          const maxOrder = dbRows.length > 0 ? Math.max(...dbRows.map((r) => r.sort_order)) + 1 : 1;
          await botQuery(
            `INSERT INTO bot_categories (wc_id, name, enabled, sort_order)
             VALUES ($1, $2, false, $3)
             ON CONFLICT (wc_id) DO NOTHING`,
            [cat.id, cat.name, maxOrder + newCount],
          );
          dbMap.set(cat.id, { wc_id: cat.id, name: cat.name, enabled: false, sort_order: maxOrder + newCount });
          newCount++;
        }
      }
    }

    // Re-read after potential inserts
    const { rows } = await botQuery<{
      wc_id: number; name: string; enabled: boolean; sort_order: number;
    }>(`SELECT wc_id, name, enabled, sort_order FROM bot_categories ORDER BY sort_order, wc_id`);

    return jsonOk({ categories: rows, newCount });
  } catch (err) {
    return handleApiError(err);
  }
}

// ── POST — save enabled state + sort order ────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const categories = body.categories as { wc_id: number; enabled: boolean; sort_order: number }[];

    if (!Array.isArray(categories)) return jsonError("Invalid body", 400);

    for (const cat of categories) {
      await botQuery(
        `UPDATE bot_categories SET enabled = $1, sort_order = $2, updated_at = NOW() WHERE wc_id = $3`,
        [cat.enabled, cat.sort_order, cat.wc_id],
      );
    }

    return jsonOk({ updated: categories.length });
  } catch (err) {
    return handleApiError(err);
  }
}
