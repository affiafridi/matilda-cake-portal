import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/migrate/store-schema
 * One-time migration: rename wc_id → source_id, add source column to
 * bot_categories and bot_products so both WooCommerce and Shopify can coexist.
 * Safe to run multiple times — uses IF NOT EXISTS / IF EXISTS guards.
 */
export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const steps: string[] = [];

    // ── bot_categories ─────────────────────────────────────────────────────
    // 1. Add source column
    await botQuery(`ALTER TABLE bot_categories ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'woocommerce'`);
    steps.push("bot_categories: added source column");

    // 2. Add source_id column (copy of wc_id)
    await botQuery(`ALTER TABLE bot_categories ADD COLUMN IF NOT EXISTS source_id INTEGER`);
    await botQuery(`UPDATE bot_categories SET source_id = wc_id WHERE source_id IS NULL AND wc_id IS NOT NULL`);
    steps.push("bot_categories: added source_id column, copied from wc_id");

    // 3. Drop old unique constraint on wc_id if it exists, add new one on (source, source_id)
    await botQuery(`ALTER TABLE bot_categories DROP CONSTRAINT IF EXISTS bot_categories_wc_id_key`).catch(() => {});
    await botQuery(`ALTER TABLE bot_categories DROP CONSTRAINT IF EXISTS bot_categories_source_source_id_key`).catch(() => {});
    await botQuery(`ALTER TABLE bot_categories ADD CONSTRAINT bot_categories_source_source_id_key UNIQUE (source, source_id)`).catch(() => {});
    steps.push("bot_categories: updated unique constraint to (source, source_id)");

    // ── bot_products ───────────────────────────────────────────────────────
    // 1. Add source column
    await botQuery(`ALTER TABLE bot_products ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'woocommerce'`);
    steps.push("bot_products: added source column");

    // 2. Add source_id column (copy of wc_id)
    await botQuery(`ALTER TABLE bot_products ADD COLUMN IF NOT EXISTS source_id INTEGER`);
    await botQuery(`UPDATE bot_products SET source_id = wc_id WHERE source_id IS NULL AND wc_id IS NOT NULL`);
    steps.push("bot_products: added source_id column, copied from wc_id");

    // 3. Drop old unique constraint on (wc_id, category_id), add new one on (source, source_id, category_id)
    await botQuery(`ALTER TABLE bot_products DROP CONSTRAINT IF EXISTS bot_products_wc_id_category_id_key`).catch(() => {});
    await botQuery(`ALTER TABLE bot_products DROP CONSTRAINT IF EXISTS bot_products_source_source_id_category_id_key`).catch(() => {});
    await botQuery(`ALTER TABLE bot_products ADD CONSTRAINT bot_products_source_source_id_category_id_key UNIQUE (source, source_id, category_id)`).catch(() => {});
    steps.push("bot_products: updated unique constraint to (source, source_id, category_id)");

    // 4. Ensure type and variations columns exist (may have been added before)
    await botQuery(`ALTER TABLE bot_products ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'simple'`);
    await botQuery(`ALTER TABLE bot_products ADD COLUMN IF NOT EXISTS variations JSONB`);
    steps.push("bot_products: ensured type and variations columns exist");

    return jsonOk({ ok: true, steps });
  } catch (err) {
    return handleApiError(err);
  }
}
