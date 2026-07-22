import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/integrations/shopify/test
 * Verifies Shopify credentials by calling the shop endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const body = await req.json().catch(() => ({}));
    const domain      = (body.shopify_domain as string | undefined)?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    const accessToken = (body.shopify_access_token as string | undefined)?.trim();

    if (!domain || !accessToken) return jsonError("Domain and access token are required", 400);

    const url = `https://${domain}/admin/api/2024-10/shop.json`;
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (res.status === 401) return jsonError("Invalid access token", 401);
    if (res.status === 404) return jsonError("Store not found — check your domain", 404);
    if (!res.ok) return jsonError(`Shopify returned ${res.status}`, 502);

    const data = await res.json() as { shop?: { name?: string; email?: string; domain?: string } };
    const shop = data.shop;

    return jsonOk({ name: shop?.name, email: shop?.email, domain: shop?.domain });
  } catch (err) {
    return handleApiError(err);
  }
}
