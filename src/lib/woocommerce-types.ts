/**
 * Cross-boundary types for the WooCommerce integration.
 * This file MUST stay free of `process.env` access or Node-only imports
 * so it can be safely imported by client components.
 */

export type WooProductSummary = {
  id: number;
  name: string;
  /** Decimal string from WooCommerce, e.g. "120.00". May be empty for variable products. */
  price: string;
  /** "simple" | "variable" | "grouped" | "external". */
  type: string;
  images: { id: number; src: string }[];
};

export type WooVariationAttribute = {
  id?: number;
  name: string;
  option: string;
};

export type WooCategory = {
  id:    number;
  name:  string;
  slug:  string;
  count: number;
};

export type WooVariation = {
  id: number;
  /** Decimal string from WooCommerce, e.g. "120.00". */
  price: string;
  /** Joined attribute string, e.g. "Chocolate / 1.2 kg". */
  name: string;
  attributes: WooVariationAttribute[];
};
