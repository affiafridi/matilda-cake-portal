import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { cacheDel } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShopifyVariant = {
  id: number;
  title: string;
  price: string;
};

type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  status: string;
  images: { src: string }[];
  variants: ShopifyVariant[];
};

/** Normalise variant data into the same shape stored by WooCommerce products. */
function normaliseVariants(
  variants: ShopifyVariant[],
): { price: string; attributes: { name: string; option: string }[] }[] {
  // Single variant with default title = simple product, no variation data needed
  if (variants.length === 1 && variants[0].title === "Default Title") return [];
  return variants.map((v) => ({
    price:      v.price,
    attributes: [{ name: "Variant", option: v.title }],
  }));
}

/** Fetch all active products in a Shopify collection (cursor-paginated). */
async function fetchCollectionProducts(
  domain: string,
  token: string,
  version: string,
  collectionId: number,
): Promise<ShopifyProduct[]> {
  const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
  const all: ShopifyProduct[] = [];
  let url: string | null =
    `https://${domain}/admin/api/${version}/products.json?collection_id=${collectionId}&status=active&limit=250`;

  while (url) {
    const res: Response = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) break;
    const data = await res.json() as { products: ShopifyProduct[] };
    all.push(...(data.products ?? []));
    const link: string = res.headers.get("link") ?? "";
    const next: string | null = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
    url = next;
  }
  return all;
}

/**
 * GET /api/bot/shopify-products-admin?collectionId=X
 * GET /api/bot/shopify-products-admin?collectionId=X&refresh=true  — syncs from Shopify first
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const collectionId = parseInt(req.nextUrl.searchParams.get("collectionId") ?? "0", 10);
    if (!collectionId) return jsonError("collectionId is required", 400);

    const refresh = req.nextUrl.searchParams.get("refresh") === "true";

    const { rows: dbRows } = await botQuery<{
      id: number; source_id: number; name: string; price: string;
      image: string; permalink: string; enabled: boolean; sort_order: number;
      type: string; variations: unknown;
    }>(
      `SELECT id, source_id, name, price, image, permalink, enabled, sort_order,
              COALESCE(type,'simple') as type, variations
       FROM bot_products WHERE source = 'shopify' AND category_id = $1 ORDER BY sort_order, source_id`,
      [collectionId],
    );

    const dbMap = new Set(dbRows.map((r) => r.source_id));
    let newCount = 0;

    if (refresh) {
      const { shopify_domain, shopify_access_token, shopify_api_version } = await getIntegrations();
      if (!shopify_domain || !shopify_access_token) return jsonError("Shopify not configured", 500);

      const domain  = shopify_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const version = shopify_api_version || "2024-10";

      const products = await fetchCollectionProducts(domain, shopify_access_token, version, collectionId);

      const maxOrder = dbRows.length > 0 ? Math.max(...dbRows.map((r) => r.sort_order)) + 1 : 0;

      for (const [i, p] of products.entries()) {
        const variants      = normaliseVariants(p.variants);
        const isVariable    = variants.length > 0;
        const prices        = p.variants.map((v) => parseFloat(v.price)).filter((n) => !isNaN(n) && n > 0);
        const basePrice     = prices.length ? String(Math.min(...prices)) : "";
        const image         = p.images?.[0]?.src ?? "";
        const permalink     = `https://${domain}/products/${p.handle}`;
        const type          = isVariable ? "variable" : "simple";
        const variationsJson = variants.length ? JSON.stringify(variants) : null;

        if (!dbMap.has(p.id)) {
          await botQuery(
            `INSERT INTO bot_products (source, source_id, category_id, name, price, image, permalink, type, variations, enabled, sort_order)
             VALUES ('shopify', $1, $2, $3, $4, $5, $6, $7, $8, true, $9)
             ON CONFLICT (source, source_id, category_id) DO NOTHING`,
            [p.id, collectionId, p.title, basePrice, image, permalink, type, variationsJson, maxOrder + i],
          );
          newCount++;
        } else {
          await botQuery(
            `UPDATE bot_products SET name=$1, price=$2, image=$3, permalink=$4, type=$5, variations=$6, updated_at=NOW()
             WHERE source='shopify' AND source_id=$7 AND category_id=$8`,
            [p.title, basePrice, image, permalink, type, variationsJson, p.id, collectionId],
          );
        }
        cacheDel(`shopify_product:${p.id}`);
      }
    }

    const { rows } = await botQuery<{
      id: number; source_id: number; name: string; price: string;
      image: string; permalink: string; enabled: boolean; sort_order: number;
      type: string; variations: unknown;
    }>(
      `SELECT id, source_id, name, price, image, permalink, enabled, sort_order,
              COALESCE(type,'simple') as type, variations
       FROM bot_products WHERE source = 'shopify' AND category_id = $1 ORDER BY sort_order, source_id`,
      [collectionId],
    );

    return jsonOk({ products: rows, newCount });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/bot/shopify-products-admin
 * Save enabled/sort_order for products (works by row id — same as WooCommerce).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const body = await req.json().catch(() => ({}));
    const products = body.products as { id: number; enabled: boolean; sort_order: number }[];
    if (!Array.isArray(products)) return jsonError("Invalid body", 400);

    for (const p of products) {
      await botQuery(
        `UPDATE bot_products SET enabled=$1, sort_order=$2, updated_at=NOW() WHERE id=$3`,
        [p.enabled, p.sort_order, p.id],
      );
    }

    return jsonOk({ updated: products.length });
  } catch (err) {
    return handleApiError(err);
  }
}
