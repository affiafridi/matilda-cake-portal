import "server-only";
import type {
  WooCategory,
  WooProductSummary,
  WooVariation,
  WooVariationAttribute,
} from "./woocommerce-types";
import { getIntegrations } from "@/lib/integrations";

export type { WooProductSummary, WooVariation, WooVariationAttribute };

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
  const { wc_url, wc_consumer_key, wc_consumer_secret } = await getIntegrations();
  if (!wc_url || !wc_consumer_key || !wc_consumer_secret) throw new WooConfigError();

  const base  = wc_url.replace(/\/$/, "");
  const url   = `${base}${path.startsWith("/") ? path : "/" + path}`;
  const token = Buffer.from(`${wc_consumer_key}:${wc_consumer_secret}`).toString("base64");

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${token}`, Accept: "application/json" },
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
  attributes?: { name?: string; options?: string[] }[];
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
    orderby: "title",
    order: "asc",
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
    attributes: (p.attributes ?? []).map((a) => ({
      name: decodeEntities(a.name ?? ""),
      options: (a.options ?? []).map((o) => decodeEntities(o)),
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

// ---------- Categories ----------

type RawCategory = {
  id:    number;
  name:  string;
  slug:  string;
  count: number;
};

export async function searchCategories(
  query: string,
  limit = 8,
): Promise<WooCategory[]> {
  const params = new URLSearchParams({
    search:   query,
    per_page: String(limit),
    orderby:  "count",
    order:    "desc",
    hide_empty: "true",
  });
  const cats = await wooFetch<RawCategory[]>(
    `/wp-json/wc/v3/products/categories?${params.toString()}`,
  );
  return cats.map((c) => ({
    id:    c.id,
    name:  decodeEntities(c.name ?? ""),
    slug:  c.slug ?? "",
    count: c.count ?? 0,
  }));
}

export async function getProductsByCategory(
  categoryId: number,
  limit = 20,
): Promise<WooProductSummary[]> {
  const params = new URLSearchParams({
    category: String(categoryId),
    per_page: String(limit),
    status:   "publish",
  });
  const products = await wooFetch<RawProduct[]>(
    `/wp-json/wc/v3/products?${params.toString()}`,
  );
  return products.map((p) => ({
    id:     p.id,
    name:   decodeEntities(p.name ?? ""),
    price:  p.price ?? "",
    type:   p.type ?? "simple",
    images: (p.images ?? []).slice(0, 1).map((img) => ({ id: img.id, src: img.src })),
    attributes: (p.attributes ?? []).map((a) => ({
      name: decodeEntities(a.name ?? ""),
      options: (a.options ?? []).map((o) => decodeEntities(o)),
    })),
  }));
}

export { WooConfigError, WooApiError };
