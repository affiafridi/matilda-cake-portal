import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { cacheOr, cacheDel_prefix, TTL } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET — fetch all WooCommerce categories (DB state + optionally refresh from WooCommerce) ──
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const refresh = req.nextUrl.searchParams.get("refresh") === "true";

    if (refresh) cacheDel_prefix("wc_cat:");

    const { rows: dbRows } = refresh
      ? await botQuery<{ source_id: number; name: string; enabled: boolean; sort_order: number }>(
          `SELECT source_id, name, enabled, sort_order FROM bot_categories WHERE source = 'woocommerce' ORDER BY sort_order, source_id`,
        )
      : await cacheOr(
          "wc_categories",
          TTL.WC_CATEGORIES,
          () => botQuery<{ source_id: number; name: string; enabled: boolean; sort_order: number }>(
            `SELECT source_id, name, enabled, sort_order FROM bot_categories WHERE source = 'woocommerce' ORDER BY sort_order, source_id`,
          ).then((r) => r.rows),
        ).then((rows) => ({ rows }));

    const dbMap = new Map(dbRows.map((r) => [r.source_id, r]));
    let newCount = 0;

    if (refresh) {
      const { wc_url: wcUrl, wc_consumer_key: key, wc_consumer_secret: sec } = await getIntegrations();
      if (!wcUrl || !key || !sec) return jsonError("WooCommerce not configured", 500);

      const base       = wcUrl.replace(/\/$/, "");
      const auth       = Buffer.from(`${key}:${sec}`).toString("base64");
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${base}/wp-json/wc/v3/products/categories?per_page=100`, {
        headers: { Authorization: `Basic ${auth}` },
        cache: "no-store",
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[wc-categories] WC error:", res.status, body.slice(0, 300));
        return jsonError("Failed to fetch categories from WooCommerce", 502);
      }

      const wcCats = await res.json() as { id: number; name: string; count: number }[];

      for (const cat of wcCats) {
        if (!dbMap.has(cat.id)) {
          const maxOrder = dbRows.length > 0 ? Math.max(...dbRows.map((r) => r.sort_order)) + 1 : 1;
          await botQuery(
            `INSERT INTO bot_categories (source, source_id, name, enabled, sort_order)
             VALUES ('woocommerce', $1, $2, false, $3)
             ON CONFLICT (source, source_id) DO NOTHING`,
            [cat.id, cat.name, maxOrder + newCount],
          );
          dbMap.set(cat.id, { source_id: cat.id, name: cat.name, enabled: false, sort_order: maxOrder + newCount });
          newCount++;
        }
      }
    }

    const { rows } = await botQuery<{
      source_id: number; name: string; enabled: boolean; sort_order: number;
    }>(`SELECT source_id, name, enabled, sort_order FROM bot_categories WHERE source = 'woocommerce' ORDER BY sort_order, source_id`);

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
    const categories = body.categories as { source_id: number; enabled: boolean; sort_order: number }[];

    if (!Array.isArray(categories)) return jsonError("Invalid body", 400);

    for (const cat of categories) {
      await botQuery(
        `UPDATE bot_categories SET enabled = $1, sort_order = $2, updated_at = NOW()
         WHERE source = 'woocommerce' AND source_id = $3`,
        [cat.enabled, cat.sort_order, cat.source_id],
      );
    }

    cacheDel_prefix("wc_cat:");
    cacheDel_prefix("wc_categories");

    return jsonOk({ updated: categories.length });
  } catch (err) {
    return handleApiError(err);
  }
}
