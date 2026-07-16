import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { cacheDel, cacheDel_prefix } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/wc-products-admin?categoryId=32&refresh=true
 * Returns products for a category from bot_products table.
 * Pass ?refresh=true to sync latest from WooCommerce.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const categoryId = parseInt(req.nextUrl.searchParams.get("categoryId") ?? "0", 10);
    if (!categoryId) return jsonError("categoryId is required", 400);

    const refresh = req.nextUrl.searchParams.get("refresh") === "true";

    const { rows: dbRows } = await botQuery<{
      id: number; wc_id: number; name: string; price: string;
      image: string; permalink: string; enabled: boolean; sort_order: number;
    }>(`SELECT id, wc_id, name, price, image, permalink, enabled, sort_order
        FROM bot_products WHERE category_id = $1 ORDER BY sort_order, wc_id`, [categoryId]);

    const dbMap = new Map(dbRows.map((r) => [r.wc_id, r]));
    let newCount = 0;

    if (refresh) {
      const { wc_url, wc_consumer_key, wc_consumer_secret } = await getIntegrations();
      if (!wc_url || !wc_consumer_key || !wc_consumer_secret)
        return jsonError("WooCommerce not configured", 500);

      const wcBase = wc_url.replace(/\/$/, "");
      const auth   = Buffer.from(`${wc_consumer_key}:${wc_consumer_secret}`).toString("base64");

      // Ensure variations columns exist (safe to run on every refresh)
      await botQuery(`ALTER TABLE bot_products ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'simple'`);
      await botQuery(`ALTER TABLE bot_products ADD COLUMN IF NOT EXISTS variations JSONB`);

      let page = 1;
      let fetched: { id: number; name: string; price: string; type: string; images: { src: string }[]; permalink: string }[] = [];

      // Paginate through all WC products in this category
      while (true) {
        const res = await fetch(
          `${wcBase}/wp-json/wc/v3/products?category=${categoryId}&page=${page}&per_page=50&status=publish`,
          { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" }
        );
        if (!res.ok) break;
        const batch = await res.json() as typeof fetched;
        if (!batch.length) break;
        fetched = fetched.concat(batch);
        const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1", 10);
        if (page >= totalPages) break;
        page++;
      }

      const maxOrder = dbRows.length > 0 ? Math.max(...dbRows.map((r) => r.sort_order)) + 1 : 0;

      for (const [i, p] of fetched.entries()) {
        // Fetch variations for variable products — trim to only what the bot uses
        type WcVariationRaw = { id: number; price: string; attributes: { name: string; option: string }[] };
        type WcVariationTrimmed = { id: number; price: string; attributes: { name: string; option: string }[] };
        let variations: WcVariationTrimmed[] = [];
        if (p.type === "variable") {
          try {
            const vRes = await fetch(
              `${wcBase}/wp-json/wc/v3/products/${p.id}/variations?per_page=50`,
              { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" }
            );
            if (vRes.ok) {
              const raw = await vRes.json() as WcVariationRaw[];
              variations = raw.map((v) => ({
                id:         v.id,
                price:      v.price,
                attributes: (v.attributes ?? []).map((a) => ({ name: a.name, option: a.option })),
              }));
            }
          } catch { /* ignore variation fetch failures */ }
        }

        const productType = p.type ?? "simple";
        const variationsJson = variations.length > 0 ? JSON.stringify(variations) : null;

        if (!dbMap.has(p.id)) {
          await botQuery(
            `INSERT INTO bot_products (wc_id, category_id, name, price, image, permalink, type, variations, enabled, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
             ON CONFLICT (wc_id, category_id) DO NOTHING`,
            [p.id, categoryId, p.name, p.price ?? "", p.images?.[0]?.src ?? "", p.permalink, productType, variationsJson, maxOrder + i]
          );
          newCount++;
        } else {
          // Update name/price/image/type/variations in case they changed in WC
          await botQuery(
            `UPDATE bot_products SET name=$1, price=$2, image=$3, permalink=$4, type=$5, variations=$6, updated_at=NOW()
             WHERE wc_id=$7 AND category_id=$8`,
            [p.name, p.price ?? "", p.images?.[0]?.src ?? "", p.permalink, productType, variationsJson, p.id, categoryId]
          );
        }
        // Bust per-product cache so ?id=X returns fresh type+variations immediately
        cacheDel(`wc_product:${p.id}`);
      }
      // Bust category and search caches for this category
      cacheDel_prefix(`wc_cat:${categoryId}`);
      cacheDel_prefix(`wc_search:`);
    }

    const { rows } = await botQuery<{
      id: number; wc_id: number; name: string; price: string;
      image: string; permalink: string; enabled: boolean; sort_order: number;
    }>(`SELECT id, wc_id, name, price, image, permalink, enabled, sort_order
        FROM bot_products WHERE category_id = $1 ORDER BY sort_order, wc_id`, [categoryId]);

    return jsonOk({ products: rows, newCount });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/bot/wc-products-admin
 * Save enabled/sort_order for products.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const products = body.products as { id: number; enabled: boolean; sort_order: number }[];
    if (!Array.isArray(products)) return jsonError("Invalid body", 400);

    for (const p of products) {
      await botQuery(
        `UPDATE bot_products SET enabled=$1, sort_order=$2, updated_at=NOW() WHERE id=$3`,
        [p.enabled, p.sort_order, p.id]
      );
    }

    return jsonOk({ updated: products.length });
  } catch (err) {
    return handleApiError(err);
  }
}
