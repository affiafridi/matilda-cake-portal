import type { NextRequest } from "next/server";
import { getProductVariations } from "@/lib/woocommerce";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";

/**
 * GET /api/woocommerce/products/[productId]/variations
 * Returns up to 50 variations for the given WooCommerce product.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ productId: string }> },
) {
  try {
    const { productId } = await context.params;
    const id = Number(productId);
    if (!Number.isInteger(id) || id <= 0) {
      return jsonError("Invalid product id", 400);
    }
    const variations = await getProductVariations(id, 50);
    return jsonOk(variations);
  } catch (error) {
    if (error instanceof Error && error.name === "WooConfigError") {
      return jsonError("WooCommerce is not configured", 503);
    }
    if (error instanceof Error && error.name === "WooApiError") {
      return jsonError("WooCommerce variations request failed", 502);
    }
    return handleApiError(error);
  }
}
