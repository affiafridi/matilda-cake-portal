import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";
import { cacheOr, TTL } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WC_TIMEOUT_MS = 4000; // abort WooCommerce calls after 4 seconds

type WcProduct = {
  id: number; name: string; price: string; type: string;
  meta_data: { key: string; value: string }[];
  images: { src: string }[]; permalink: string;
};

/** fetch() with a hard timeout — prevents bot from hanging forever on slow WC responses. */
async function wcFetch(url: string, auth: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WC_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch variations for a single variable product. Returns [] on timeout/error. */
async function fetchVariations(
  productId: number,
  wcBase: string,
  auth: string,
): Promise<{ name: string; price: string }[]> {
  try {
    const res = await wcFetch(
      `${wcBase}/wp-json/wc/v3/products/${productId}/variations?per_page=20&status=publish`,
      auth,
    );
    if (!res.ok) return [];
    const data = await res.json() as { price: string; attributes: { name: string; option: string }[] }[];
    return data
      .map((v) => ({ name: v.attributes.map((a) => a.option).join(" / ") || "Default", price: v.price }))
      .filter((v) => v.price);
  } catch {
    return []; // timeout or network error — degrade gracefully
  }
}

/** Fetch full product data (type, variations, minPrice, maxPrice) from WooCommerce by IDs. */
async function enrichFromWC(
  wcIds: number[],
  wcBase: string,
  auth: string,
): Promise<Map<number, Record<string, unknown>>> {
  const map = new Map<number, Record<string, unknown>>();
  if (!wcIds.length) return map;

  try {
    const res = await wcFetch(
      `${wcBase}/wp-json/wc/v3/products?include=${wcIds.join(",")}&per_page=${wcIds.length}&status=publish`,
      auth,
    );
    if (!res.ok) return map;

    const products = await res.json() as WcProduct[];
    await Promise.all(products.map(async (p) => {
      const isVariable = p.type === "variable";
      const meta  = Object.fromEntries((p.meta_data ?? []).map((m) => [m.key, m.value]));
      const entry: Record<string, unknown> = { type: p.type ?? "simple" };
      if (isVariable) {
        entry.minPrice  = meta["_min_variation_price"] ?? p.price;
        entry.maxPrice  = meta["_max_variation_price"] ?? p.price;
        entry.variations = await fetchVariations(p.id, wcBase, auth);
      }
      map.set(p.id, entry);
    }));
  } catch { /* best-effort */ }

  return map;
}

/** Enrich a raw WC product list with variations (for the WC-direct paths). */
async function enrichWcList(products: WcProduct[], wcBase: string, auth: string): Promise<Record<string, unknown>[]> {
  return Promise.all(products.map(async (p) => {
    const isVariable = p.type === "variable";
    const meta = Object.fromEntries((p.meta_data ?? []).map((m) => [m.key, m.value]));
    const base: Record<string, unknown> = {
      id: p.id, name: p.name, price: p.price,
      type: p.type ?? "simple",
      image: p.images?.[0]?.src ?? "",
      permalink: p.permalink,
    };
    if (isVariable) {
      base.minPrice   = meta["_min_variation_price"] ?? p.price;
      base.maxPrice   = meta["_max_variation_price"] ?? p.price;
      base.variations = await fetchVariations(p.id, wcBase, auth);
    }
    return base;
  }));
}

/**
 * GET /api/bot/wc-products?id=X                        — single product by wc_id
 * GET /api/bot/wc-products?categoryId=X&page=1&perPage=9
 * GET /api/bot/wc-products?search=keyword&page=1&perPage=9
 */
export async function GET(req: NextRequest) {
  try {
    const { inbox_webhook_secret, wc_url, wc_consumer_key, wc_consumer_secret } = await getIntegrations();

    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) return jsonError("Unauthorized", 401);

    const params  = req.nextUrl.searchParams;
    const wcId    = parseInt(params.get("id") ?? "0", 10);
    const catId   = parseInt(params.get("categoryId") ?? "0", 10);
    const search  = (params.get("search") ?? "").trim();
    const page    = parseInt(params.get("page") ?? "1", 10);
    const perPage = parseInt(params.get("perPage") ?? "9", 10);
    const offset  = (page - 1) * perPage;

    // ── SINGLE PRODUCT MODE ──────────────────────────────────────────────────
    if (wcId) {
      const cacheKey = `wc_product:${wcId}`;
      const product = await cacheOr(cacheKey, TTL.WC_PRODUCTS, async () => {
        // Try with type+variations columns first; fall back if columns don't exist yet (pre-Sync)
        let row: { wc_id: number; name: string; price: string; image: string; permalink: string; type?: string; variations?: unknown } | undefined;
        try {
          const { rows } = await botQuery<{ wc_id: number; name: string; price: string; image: string; permalink: string; type: string; variations: unknown }>(
            `SELECT wc_id, name, price, image, permalink, COALESCE(type,'simple') as type, variations FROM bot_products WHERE wc_id = $1 AND enabled = true LIMIT 1`,
            [wcId],
          );
          row = rows[0];
        } catch {
          const { rows } = await botQuery<{ wc_id: number; name: string; price: string; image: string; permalink: string }>(
            `SELECT wc_id, name, price, image, permalink FROM bot_products WHERE wc_id = $1 AND enabled = true LIMIT 1`,
            [wcId],
          );
          row = rows[0];
        }
        if (row) {
          return { id: row.wc_id, name: row.name, price: row.price, image: row.image, permalink: row.permalink, type: row.type ?? "simple", variations: row.variations ?? [] };
        }
        // Fallback to WooCommerce if not in bot DB
        const wcBase = (wc_url ?? "").replace(/\/$/, "");
        const auth   = wc_consumer_key && wc_consumer_secret
          ? Buffer.from(`${wc_consumer_key}:${wc_consumer_secret}`).toString("base64") : "";
        if (!wcBase || !auth) throw new Error("Product not found");
        const res = await wcFetch(`${wcBase}/wp-json/wc/v3/products/${wcId}`, auth);
        if (!res.ok) throw new Error("Product not found");
        const p = await res.json() as WcProduct;
        return { id: p.id, name: p.name, price: p.price, image: p.images?.[0]?.src ?? "", permalink: p.permalink, type: p.type ?? "simple", variations: [] };
      });
      return jsonOk({ product });
    }

    if (!catId && !search) return jsonError("id, categoryId or search is required", 400);

    const wcBase = (wc_url ?? "").replace(/\/$/, "");
    const auth   = wc_consumer_key && wc_consumer_secret
      ? Buffer.from(`${wc_consumer_key}:${wc_consumer_secret}`).toString("base64") : "";

    // ── SEARCH MODE ──────────────────────────────────────────────────────────
    if (search) {
      const cacheKey = `wc_search:${search.toLowerCase()}:${page}:${perPage}`;
      const result = await cacheOr(cacheKey, TTL.WC_PRODUCTS, async () => {
        const { rows: countRows } = await botQuery<{ count: string }>(
          `SELECT COUNT(*) as count FROM bot_products WHERE enabled = true AND name ILIKE $1`,
          [`%${search}%`],
        );
        const totalCount = parseInt(countRows[0]?.count ?? "0", 10);

        if (totalCount > 0) {
          const { rows } = await botQuery<{ wc_id: number; name: string; price: string; image: string; permalink: string; type: string; variations: { price: string }[] | null }>(
            `SELECT wc_id, name, price, image, permalink, COALESCE(type,'simple') as type, variations FROM bot_products
             WHERE enabled = true AND name ILIKE $1
             ORDER BY sort_order, wc_id LIMIT $2 OFFSET $3`,
            [`%${search}%`, perPage, offset],
          );
          const totalPages = Math.ceil(totalCount / perPage);
          const products   = rows.map((p) => {
            const isVar = p.type === "variable";
            const vars  = Array.isArray(p.variations) ? p.variations : [];
            const prices = vars.map((v) => parseFloat(v.price)).filter((n) => !isNaN(n) && n > 0);
            return {
              id: p.wc_id, name: p.name, price: p.price, image: p.image, permalink: p.permalink, type: p.type,
              ...(isVar && prices.length ? { minPrice: String(Math.min(...prices)) } : {}),
            };
          });
          return { products, hasMore: page < totalPages, page, totalPages };
        }

        if (!wcBase || !auth) throw new Error("WooCommerce not configured");
        const res = await wcFetch(
          `${wcBase}/wp-json/wc/v3/products?search=${encodeURIComponent(search)}&page=${page}&per_page=${perPage}&status=publish`,
          auth,
        );
        if (!res.ok) throw new Error("WooCommerce search failed");
        const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1", 10);
        const wcProducts = await res.json() as WcProduct[];
        const products   = await enrichWcList(wcProducts, wcBase, auth);
        return { products, hasMore: page < totalPages, page, totalPages };
      });
      return jsonOk(result);
    }

    // ── CATEGORY MODE ────────────────────────────────────────────────────────
    const cacheKey = `wc_cat:${catId}:${page}:${perPage}`;
    const result = await cacheOr(cacheKey, TTL.WC_PRODUCTS, async () => {
      const { rows: countRows } = await botQuery<{ count: string }>(
        `SELECT COUNT(*) as count FROM bot_products WHERE category_id = $1 AND enabled = true`, [catId],
      );
      const totalCount = parseInt(countRows[0]?.count ?? "0", 10);

      if (totalCount > 0) {
        const { rows } = await botQuery<{ wc_id: number; name: string; price: string; image: string; permalink: string; type: string; variations: { price: string }[] | null }>(
          `SELECT wc_id, name, price, image, permalink, COALESCE(type,'simple') as type, variations FROM bot_products
           WHERE category_id = $1 AND enabled = true
           ORDER BY sort_order, wc_id LIMIT $2 OFFSET $3`,
          [catId, perPage, offset],
        );
        const totalPages = Math.ceil(totalCount / perPage);
        const products   = rows.map((p) => {
          const isVar = p.type === "variable";
          const vars  = Array.isArray(p.variations) ? p.variations : [];
          const prices = vars.map((v) => parseFloat(v.price)).filter((n) => !isNaN(n) && n > 0);
          return {
            id: p.wc_id, name: p.name, price: p.price, image: p.image, permalink: p.permalink, type: p.type,
            ...(isVar && prices.length ? { minPrice: String(Math.min(...prices)) } : {}),
          };
        });
        return { products, hasMore: page < totalPages, page, totalPages };
      }

      if (!wcBase || !auth) throw new Error("WooCommerce not configured");
      const res = await wcFetch(
        `${wcBase}/wp-json/wc/v3/products?category=${catId}&page=${page}&per_page=${perPage}&status=publish&orderby=popularity`,
        auth,
      );
      if (!res.ok) throw new Error("Failed to fetch from WooCommerce");
      const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1", 10);
      const wcProducts = await res.json() as WcProduct[];
      const products   = await enrichWcList(wcProducts, wcBase, auth);
      return { products, hasMore: page < totalPages, page, totalPages };
    });
    return jsonOk(result);

  } catch (err) {
    return handleApiError(err);
  }
}
