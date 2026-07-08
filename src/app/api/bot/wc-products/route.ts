import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WcProduct = {
  id: number; name: string; price: string; type: string;
  meta_data: { key: string; value: string }[];
  images: { src: string }[]; permalink: string;
};

/** Fetch full product data (type, variations, minPrice, maxPrice) from WooCommerce by IDs. */
async function enrichFromWC(
  wcIds: number[],
  wcBase: string,
  auth: string,
): Promise<Map<number, Record<string, unknown>>> {
  const map = new Map<number, Record<string, unknown>>();
  if (!wcIds.length) return map;

  try {
    const res = await fetch(
      `${wcBase}/wp-json/wc/v3/products?include=${wcIds.join(",")}&per_page=${wcIds.length}&status=publish`,
      { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" },
    );
    if (!res.ok) return map;

    const products = await res.json() as WcProduct[];
    await Promise.all(products.map(async (p) => {
      const isVariable = p.type === "variable";
      const meta = Object.fromEntries((p.meta_data ?? []).map((m) => [m.key, m.value]));
      const entry: Record<string, unknown> = { type: p.type ?? "simple" };
      if (isVariable) {
        entry.minPrice = meta["_min_variation_price"] ?? p.price;
        entry.maxPrice = meta["_max_variation_price"] ?? p.price;
        try {
          const vRes = await fetch(
            `${wcBase}/wp-json/wc/v3/products/${p.id}/variations?per_page=20&status=publish`,
            { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" },
          );
          if (vRes.ok) {
            const vData = await vRes.json() as { price: string; attributes: { name: string; option: string }[] }[];
            entry.variations = vData
              .map((v) => ({ name: v.attributes.map((a) => a.option).join(" / ") || "Default", price: v.price }))
              .filter((v) => v.price);
          }
        } catch { entry.variations = []; }
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
      base.minPrice = meta["_min_variation_price"] ?? p.price;
      base.maxPrice = meta["_max_variation_price"] ?? p.price;
      try {
        const vRes = await fetch(
          `${wcBase}/wp-json/wc/v3/products/${p.id}/variations?per_page=20&status=publish`,
          { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" },
        );
        if (vRes.ok) {
          const vData = await vRes.json() as { price: string; attributes: { name: string; option: string }[] }[];
          base.variations = vData
            .map((v) => ({ name: v.attributes.map((a) => a.option).join(" / ") || "Default", price: v.price }))
            .filter((v) => v.price);
        }
      } catch { base.variations = []; }
    }
    return base;
  }));
}

/**
 * GET /api/bot/wc-products?categoryId=X&page=1&perPage=9
 * GET /api/bot/wc-products?search=keyword&page=1&perPage=9
 */
export async function GET(req: NextRequest) {
  try {
    const { inbox_webhook_secret, wc_url, wc_consumer_key, wc_consumer_secret } = await getIntegrations();

    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) return jsonError("Unauthorized", 401);

    const params  = req.nextUrl.searchParams;
    const catId   = parseInt(params.get("categoryId") ?? "0", 10);
    const search  = (params.get("search") ?? "").trim();
    const page    = parseInt(params.get("page") ?? "1", 10);
    const perPage = parseInt(params.get("perPage") ?? "9", 10);
    const offset  = (page - 1) * perPage;

    if (!catId && !search) return jsonError("categoryId or search is required", 400);

    const wcBase = (wc_url ?? "").replace(/\/$/, "");
    const auth   = wc_consumer_key && wc_consumer_secret
      ? Buffer.from(`${wc_consumer_key}:${wc_consumer_secret}`).toString("base64")
      : "";

    // ── SEARCH MODE ──────────────────────────────────────────────────────────
    if (search) {
      // Try bot_products first
      const { rows: countRows } = await botQuery<{ count: string }>(
        `SELECT COUNT(*) as count FROM bot_products WHERE enabled = true AND name ILIKE $1`,
        [`%${search}%`],
      );
      const totalCount = parseInt(countRows[0]?.count ?? "0", 10);

      if (totalCount > 0) {
        const { rows } = await botQuery<{ wc_id: number; name: string; price: string; image: string; permalink: string }>(
          `SELECT wc_id, name, price, image, permalink FROM bot_products
           WHERE enabled = true AND name ILIKE $1
           ORDER BY sort_order, wc_id LIMIT $2 OFFSET $3`,
          [`%${search}%`, perPage, offset],
        );
        const totalPages = Math.ceil(totalCount / perPage);

        // Enrich with type + variations from WooCommerce
        const enrichMap = wcBase && auth
          ? await enrichFromWC(rows.map((r) => r.wc_id), wcBase, auth)
          : new Map();

        const products = rows.map((p) => {
          const extra = enrichMap.get(p.wc_id) ?? {};
          return { id: p.wc_id, name: p.name, price: p.price, image: p.image, permalink: p.permalink, type: "simple", ...extra };
        });
        return jsonOk({ products, hasMore: page < totalPages, page, totalPages });
      }

      // Fallback to WooCommerce search
      if (!wcBase || !auth) return jsonError("WooCommerce not configured", 500);
      const res = await fetch(
        `${wcBase}/wp-json/wc/v3/products?search=${encodeURIComponent(search)}&page=${page}&per_page=${perPage}&status=publish`,
        { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" },
      );
      if (!res.ok) return jsonError("Failed to search WooCommerce products", 502);
      const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1", 10);
      const wcProducts = await res.json() as WcProduct[];
      const products = await enrichWcList(wcProducts, wcBase, auth);
      return jsonOk({ products, hasMore: page < totalPages, page, totalPages });
    }

    // ── CATEGORY MODE ────────────────────────────────────────────────────────
    const { rows: countRows } = await botQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM bot_products WHERE category_id = $1`, [catId],
    );
    const totalCount = parseInt(countRows[0]?.count ?? "0", 10);

    if (totalCount > 0) {
      const { rows } = await botQuery<{ wc_id: number; name: string; price: string; image: string; permalink: string }>(
        `SELECT wc_id, name, price, image, permalink FROM bot_products
         WHERE category_id = $1 AND enabled = true
         ORDER BY sort_order, wc_id LIMIT $2 OFFSET $3`,
        [catId, perPage, offset],
      );
      const { rows: totalRows } = await botQuery<{ count: string }>(
        `SELECT COUNT(*) as count FROM bot_products WHERE category_id = $1 AND enabled = true`, [catId],
      );
      const total      = parseInt(totalRows[0]?.count ?? "0", 10);
      const totalPages = Math.ceil(total / perPage);

      // Enrich with type + variations from WooCommerce
      const enrichMap = wcBase && auth
        ? await enrichFromWC(rows.map((r) => r.wc_id), wcBase, auth)
        : new Map();

      const products = rows.map((p) => {
        const extra = enrichMap.get(p.wc_id) ?? {};
        return { id: p.wc_id, name: p.name, price: p.price, image: p.image, permalink: p.permalink, type: "simple", ...extra };
      });
      return jsonOk({ products, hasMore: page < totalPages, page, totalPages });
    }

    // Fallback — fetch directly from WooCommerce
    if (!wcBase || !auth) return jsonError("WooCommerce not configured", 500);
    const res = await fetch(
      `${wcBase}/wp-json/wc/v3/products?category=${catId}&page=${page}&per_page=${perPage}&status=publish&orderby=popularity`,
      { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" },
    );
    if (!res.ok) return jsonError("Failed to fetch products from WooCommerce", 502);
    const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1", 10);
    const wcProducts = await res.json() as WcProduct[];
    const products = await enrichWcList(wcProducts, wcBase, auth);
    return jsonOk({ products, hasMore: page < totalPages, page, totalPages });

  } catch (err) {
    return handleApiError(err);
  }
}
