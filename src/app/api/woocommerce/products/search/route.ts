import type { NextRequest } from "next/server";
import { searchProducts } from "@/lib/woocommerce";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";

/**
 * GET /api/woocommerce/products/search?q=...
 * Returns up to 10 published products matching the search term.
 * Empty / very short queries return an empty array (no Woo call made).
 */
export async function GET(req: NextRequest) {
  try {
    const q     = (req.nextUrl.searchParams.get("q")     ?? "").trim();
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10);
    if (q.length < 2) {
      return jsonOk([]);
    }
    const products = await searchProducts(q, Math.min(limit, 50));
    return jsonOk(products);
  } catch (error) {
    if (error instanceof Error && error.name === "WooConfigError") {
      return jsonError("WooCommerce is not configured", 503);
    }
    if (error instanceof Error && error.name === "WooApiError") {
      return jsonError("WooCommerce search failed", 502);
    }
    return handleApiError(error);
  }
}
