import type { NextRequest } from "next/server";
import { getProductsByCategory } from "@/lib/woocommerce";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";

/**
 * GET /api/woocommerce/products/by-category?categoryId=123
 * Returns up to 20 published products in the given category.
 */
export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("categoryId") ?? "";
    const categoryId = parseInt(raw, 10);
    if (!categoryId || isNaN(categoryId)) return jsonError("categoryId is required", 400);
    const products = await getProductsByCategory(categoryId);
    return jsonOk(products);
  } catch (error) {
    if (error instanceof Error && error.name === "WooConfigError") return jsonError("WooCommerce is not configured", 503);
    if (error instanceof Error && error.name === "WooApiError")    return jsonError("WooCommerce request failed", 502);
    return handleApiError(error);
  }
}
