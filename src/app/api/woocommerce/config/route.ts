import { requireRole } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { handleApiError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/woocommerce/config
 * Returns non-sensitive WooCommerce config needed by the client (wc_url only).
 */
export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN", "ADMIN", "AGENT"]);
    const { wc_url } = await getIntegrations();
    return jsonOk({ wc_url: (wc_url ?? "").replace(/\/$/, "") });
  } catch (err) {
    return handleApiError(err);
  }
}
