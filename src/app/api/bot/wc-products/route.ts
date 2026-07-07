import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/wc-products?categoryId=32&page=1&perPage=9
 * Bot-facing endpoint — returns paginated enabled products for a category from bot_products table.
 * Falls back to WooCommerce directly if bot_products has no rows for this category.
 * Authenticated with x-inbox-secret header.
 */
export async function GET(req: NextRequest) {
  try {
    const { inbox_webhook_secret, wc_url, wc_consumer_key, wc_consumer_secret } = await getIntegrations();

    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) return jsonError("Unauthorized", 401);

    const params   = req.nextUrl.searchParams;
    const catId    = parseInt(params.get("categoryId") ?? "0", 10);
    const page     = parseInt(params.get("page") ?? "1", 10);
    const perPage  = parseInt(params.get("perPage") ?? "9", 10);

    if (!catId) return jsonError("categoryId is required", 400);

    const offset = (page - 1) * perPage;

    // Check if we have products in bot_products for this category
    const { rows: countRows } = await botQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM bot_products WHERE category_id = $1`, [catId]
    );
    const totalCount = parseInt(countRows[0]?.count ?? "0", 10);

    if (totalCount > 0) {
      // Serve from bot_products (admin-managed, enabled only)
      const { rows } = await botQuery<{
        wc_id: number; name: string; price: string; image: string; permalink: string;
      }>(
        `SELECT wc_id, name, price, image, permalink FROM bot_products
         WHERE category_id = $1 AND enabled = true
         ORDER BY sort_order, wc_id
         LIMIT $2 OFFSET $3`,
        [catId, perPage, offset]
      );

      const { rows: totalRows } = await botQuery<{ count: string }>(
        `SELECT COUNT(*) as count FROM bot_products WHERE category_id = $1 AND enabled = true`, [catId]
      );
      const total      = parseInt(totalRows[0]?.count ?? "0", 10);
      const totalPages = Math.ceil(total / perPage);

      const products = rows.map((p) => ({ id: p.wc_id, name: p.name, price: p.price, type: "simple", image: p.image, permalink: p.permalink }));
      return jsonOk({ products, hasMore: page < totalPages, page, totalPages });
    }

    // Fallback — fetch directly from WooCommerce if not yet synced
    if (!wc_url || !wc_consumer_key || !wc_consumer_secret) return jsonError("WooCommerce not configured", 500);

    const wcBase = wc_url.replace(/\/$/, "");
    const auth   = Buffer.from(`${wc_consumer_key}:${wc_consumer_secret}`).toString("base64");
    const url    = `${wcBase}/wp-json/wc/v3/products?category=${catId}&page=${page}&per_page=${perPage}&status=publish&orderby=popularity`;

    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" });
    if (!res.ok) return jsonError("Failed to fetch products from WooCommerce", 502);

    const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1", 10);
    const wcProducts = await res.json() as {
      id: number; name: string; price: string; type: string;
      meta_data: { key: string; value: string }[];
      images: { src: string }[]; permalink: string;
    }[];

    const products = await Promise.all(wcProducts.map(async (p) => {
      const isVariable = p.type === "variable";
      const meta = Object.fromEntries((p.meta_data ?? []).map((m) => [m.key, m.value]));
      const base: Record<string, unknown> = {
        id: p.id, name: p.name, price: p.price,
        type: p.type ?? "simple",
        image: p.images?.[0]?.src ?? "",
        permalink: p.permalink,
      };
      if (isVariable) {
        base.minPrice = meta["_min_variation_price"] ?? p.price;
        base.maxPrice = meta["_max_variation_price"] ?? p.price;
        try {
          const vRes = await fetch(
            `${wcBase}/wp-json/wc/v3/products/${p.id}/variations?per_page=20&status=publish`,
            { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" }
          );
          if (vRes.ok) {
            const vData = await vRes.json() as { price: string; attributes: { name: string; option: string }[] }[];
            base.variations = vData.map((v) => ({
              name:  v.attributes.map((a) => a.option).join(" / ") || "Default",
              price: v.price,
            })).filter((v) => v.price);
          }
        } catch { base.variations = []; }
      }
      return base;
    }));

    return jsonOk({ products, hasMore: page < totalPages, page, totalPages });
  } catch (err) {
    return handleApiError(err);
  }
}
