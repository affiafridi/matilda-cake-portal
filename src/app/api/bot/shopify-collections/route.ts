import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShopifyCollection = { id: number; title: string; image?: { src: string } };

/** Fetch all custom + smart collections from Shopify (handles 250-item pages). */
async function fetchAllCollections(domain: string, token: string, version: string): Promise<ShopifyCollection[]> {
  const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
  const base    = `https://${domain}/admin/api/${version}`;

  async function fetchType(type: "custom_collections" | "smart_collections"): Promise<ShopifyCollection[]> {
    const all: ShopifyCollection[] = [];
    let url: string | null = `${base}/${type}.json?limit=250`;
    while (url) {
      const res: Response = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) break;
      const data = await res.json() as Record<string, ShopifyCollection[]>;
      all.push(...(data[type] ?? []));
      const link: string = res.headers.get("link") ?? "";
      const next: string | null = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
      url = next;
    }
    return all;
  }

  const [custom, smart] = await Promise.all([
    fetchType("custom_collections"),
    fetchType("smart_collections"),
  ]);
  return [...custom, ...smart];
}

/**
 * GET /api/bot/shopify-collections
 * GET /api/bot/shopify-collections?refresh=true  — syncs from Shopify first
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const refresh = req.nextUrl.searchParams.get("refresh") === "true";

    if (refresh) {
      const { shopify_domain, shopify_access_token, shopify_api_version } = await getIntegrations();
      if (!shopify_domain || !shopify_access_token) return jsonError("Shopify not configured", 500);

      const domain  = shopify_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const version = shopify_api_version || "2024-10";

      const collections = await fetchAllCollections(domain, shopify_access_token, version);

      const { rows: existing } = await botQuery<{ source_id: number }>(
        `SELECT source_id FROM bot_categories WHERE source = 'shopify'`,
      );
      const existingIds = new Set(existing.map((r) => r.source_id));

      const { rows: maxRow } = await botQuery<{ max: number | null }>(
        `SELECT MAX(sort_order) as max FROM bot_categories WHERE source = 'shopify'`,
      );
      let nextOrder = (maxRow[0]?.max ?? 0) + 1;
      let newCount  = 0;

      for (const col of collections) {
        if (!existingIds.has(col.id)) {
          await botQuery(
            `INSERT INTO bot_categories (source, source_id, name, enabled, sort_order)
             VALUES ('shopify', $1, $2, false, $3)
             ON CONFLICT (source, source_id) DO NOTHING`,
            [col.id, col.title, nextOrder++],
          );
          newCount++;
        } else {
          await botQuery(
            `UPDATE bot_categories SET name = $1, updated_at = NOW() WHERE source = 'shopify' AND source_id = $2`,
            [col.title, col.id],
          );
        }
      }

      const { rows } = await botQuery<{
        source_id: number; name: string; enabled: boolean; sort_order: number;
      }>(`SELECT source_id, name, enabled, sort_order FROM bot_categories WHERE source = 'shopify' ORDER BY sort_order, source_id`);

      return jsonOk({ collections: rows, newCount });
    }

    const { rows } = await botQuery<{
      source_id: number; name: string; enabled: boolean; sort_order: number;
    }>(`SELECT source_id, name, enabled, sort_order FROM bot_categories WHERE source = 'shopify' ORDER BY sort_order, source_id`);

    return jsonOk({ collections: rows, newCount: 0 });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/bot/shopify-collections
 * Save enabled/sort_order for collections.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const body = await req.json().catch(() => ({}));
    const collections = body.collections as { source_id: number; enabled: boolean; sort_order: number }[];
    if (!Array.isArray(collections)) return jsonError("Invalid body", 400);

    for (const col of collections) {
      await botQuery(
        `UPDATE bot_categories SET enabled = $1, sort_order = $2, updated_at = NOW()
         WHERE source = 'shopify' AND source_id = $3`,
        [col.enabled, col.sort_order, col.source_id],
      );
    }

    return jsonOk({ updated: collections.length });
  } catch (err) {
    return handleApiError(err);
  }
}
