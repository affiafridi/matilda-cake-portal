import type { NextRequest } from "next/server";
import { searchCategories } from "@/lib/woocommerce";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";

/**
 * GET /api/woocommerce/categories/search?q=...
 * Returns up to 8 non-empty categories matching the search term, ordered by product count.
 */
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return jsonOk([]);
    const categories = await searchCategories(q);
    return jsonOk(categories);
  } catch (error) {
    if (error instanceof Error && error.name === "WooConfigError") return jsonError("WooCommerce is not configured", 503);
    if (error instanceof Error && error.name === "WooApiError")    return jsonError("WooCommerce request failed", 502);
    return handleApiError(error);
  }
}
