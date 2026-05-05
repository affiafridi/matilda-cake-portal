import "server-only";
import type {
  WooProductSummary,
  WooVariation,
  WooVariationAttribute,
} from "./woocommerce-types";

export type { WooProductSummary, WooVariation, WooVariationAttribute };

/**
 * Server-only WooCommerce REST client.
 *
 * Required env vars (configure outside source control):
 *   WOOCOMMERCE_URL              e.g. https://shop.matildacakes.com
 *   WOOCOMMERCE_CONSUMER_KEY     ck_...
 *   WOOCOMMERCE_CONSUMER_SECRET  cs_...
 *
 * Authentication uses HTTP Basic over HTTPS, which is the recommended
 * approach for the WooCommerce REST API. If the host strips the
 * Authorization header (some Apache configs), fall back to query auth.
 */

const WOO_URL = process.env.WOOCOMMERCE_URL;
const WOO_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY;
const WOO_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET;

class WooConfigError extends Error {
  constructor() {
    super("WooCommerce is not configured");
    this.name = "WooConfigError";
  }
}

class WooApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`WooCommerce API ${status}: ${body.slice(0, 200)}`);
    this.name = "WooApiError";
    this.status = status;
  }
}

function assertConfigured() {
  if (!WOO_URL || !WOO_KEY || !WOO_SECRET) {
    throw new WooConfigError();
  }
}

function authHeader(): string {
  const token = Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");
  return `Basic ${token}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");
}

async function wooFetch<T>(path: string): Promise<T> {
  assertConfigured();

  const wooUrl = WOO_URL;
  const wooKey = WOO_KEY;
  const wooSecret = WOO_SECRET;

  if (!wooUrl || !wooKey || !wooSecret) {
    throw new WooConfigError();
  }

  const base = wooUrl.replace(/\/$/, "");
  const url = `${base}${path.startsWith("/") ? path : "/" + path}`;

  const token = Buffer.from(`${wooKey}:${wooSecret}`).toString("base64");

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new WooApiError(res.status, body);
  }

  return (await res.json()) as T;
}

// ---------- Products ----------

type RawProduct = {
  id: number;
  name: string;
  price?: string;
  type?: string;
  images?: { id: number; src: string }[];
};

export async function searchProducts(
  query: string,
  limit = 10,
): Promise<WooProductSummary[]> {
  const params = new URLSearchParams({
    search: query,
    per_page: String(limit),
    status: "publish",
  });
  const products = await wooFetch<RawProduct[]>(
    `/wp-json/wc/v3/products?${params.toString()}`,
  );

  return products.map((p) => ({
    id: p.id,
    name: decodeEntities(p.name ?? ""),
    price: p.price ?? "",
    type: p.type ?? "simple",
    images: (p.images ?? []).slice(0, 1).map((img) => ({
      id: img.id,
      src: img.src,
    })),
  }));
}

// ---------- Variations ----------

type RawVariation = {
  id: number;
  price?: string;
  attributes?: { id?: number; name?: string; option?: string }[];
};

export async function getProductVariations(
  productId: number,
  limit = 50,
): Promise<WooVariation[]> {
  const params = new URLSearchParams({ per_page: String(limit) });
  const variations = await wooFetch<RawVariation[]>(
    `/wp-json/wc/v3/products/${productId}/variations?${params.toString()}`,
  );

  return variations.map((v) => {
    const attributes: WooVariationAttribute[] = (v.attributes ?? []).map(
      (a) => ({
        id: a.id,
        name: decodeEntities(a.name ?? ""),
        option: decodeEntities(a.option ?? ""),
      }),
    );
    const composedName = attributes
      .map((a) => a.option)
      .filter(Boolean)
      .join(" / ");

    return {
      id: v.id,
      price: v.price ?? "",
      name: composedName || `Variation ${v.id}`,
      attributes,
    };
  });
}

export { WooConfigError, WooApiError };
