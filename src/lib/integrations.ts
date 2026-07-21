import "server-only";
import { prisma } from "@/lib/prisma";

export type IntegrationSettings = {
  wa_access_token:          string;
  wa_phone_number_id:       string;
  wa_business_account_id:   string;
  wc_url:                   string;
  wc_consumer_key:          string;
  wc_consumer_secret:       string;
  bot_url:                  string;
  sync_secret:              string;
  inbox_webhook_secret:     string;
  openai_api_key:           string;
  ccavenue_merchant_id:     string;
  ccavenue_access_code:     string;
  ccavenue_working_key:     string;
  ccavenue_website_url:     string;
  flows_private_key:        string;
  wa_flow_id:               string;
  wc_webhook_secret:        string;
  instagram_page_access_token: string;
  instagram_verify_token:      string;
  shopify_domain:              string;
  shopify_access_token:        string;
  shopify_api_version:         string;
};

const KEYS: (keyof IntegrationSettings)[] = [
  "wa_access_token",
  "wa_phone_number_id",
  "wa_business_account_id",
  "wc_url",
  "wc_consumer_key",
  "wc_consumer_secret",
  "bot_url",
  "sync_secret",
  "inbox_webhook_secret",
  "openai_api_key",
  "ccavenue_merchant_id",
  "ccavenue_access_code",
  "ccavenue_working_key",
  "ccavenue_website_url",
  "flows_private_key",
  "wa_flow_id",
  "wc_webhook_secret",
  "instagram_page_access_token",
  "instagram_verify_token",
  "shopify_domain",
  "shopify_access_token",
  "shopify_api_version",
];

/** Read integration credentials from DB, falling back to env vars. Always fresh — no cache. */
export async function getIntegrations(): Promise<IntegrationSettings> {
  let map: Record<string, string> = {};
  try {
    const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value FROM portal_settings
      WHERE key IN (
        'wa_access_token', 'wa_phone_number_id', 'wa_business_account_id',
        'wc_url', 'wc_consumer_key', 'wc_consumer_secret', 'wc_webhook_secret',
        'bot_url', 'sync_secret', 'inbox_webhook_secret',
        'openai_api_key',
        'ccavenue_merchant_id', 'ccavenue_access_code', 'ccavenue_working_key', 'ccavenue_website_url',
        'flows_private_key', 'wa_flow_id',
        'instagram_page_access_token', 'instagram_verify_token',
        'shopify_domain', 'shopify_access_token', 'shopify_api_version'
      )
    `;
    map = Object.fromEntries(rows.map((r) => [r.key, r.value?.replace(/\s/g, "") ?? ""]));
  } catch { /* DB not ready — fall back to env */ }

  return {
    wa_access_token:        map["wa_access_token"]        || process.env.WHATSAPP_ACCESS_TOKEN        || "",
    wa_phone_number_id:     map["wa_phone_number_id"]     || process.env.WHATSAPP_PHONE_NUMBER_ID     || "",
    wa_business_account_id: map["wa_business_account_id"] || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
    wc_url:                 map["wc_url"]                 || process.env.WOOCOMMERCE_URL               || "",
    wc_consumer_key:        map["wc_consumer_key"]        || process.env.WOOCOMMERCE_CONSUMER_KEY      || "",
    wc_consumer_secret:     map["wc_consumer_secret"]     || process.env.WOOCOMMERCE_CONSUMER_SECRET   || "",
    bot_url:                map["bot_url"]                || process.env.BOT_URL                       || "",
    sync_secret:            map["sync_secret"]            || process.env.SYNC_SECRET                   || "",
    inbox_webhook_secret:   map["inbox_webhook_secret"]   || process.env.INBOX_WEBHOOK_SECRET          || "",
    openai_api_key:         map["openai_api_key"]         || process.env.OPENAI_API_KEY                || "",
    ccavenue_merchant_id:   map["ccavenue_merchant_id"]   || process.env.CCAVENUE_MERCHANT_ID          || "",
    ccavenue_access_code:   map["ccavenue_access_code"]   || process.env.CCAVENUE_ACCESS_CODE          || "",
    ccavenue_working_key:   map["ccavenue_working_key"]   || process.env.CCAVENUE_WORKING_KEY          || "",
    ccavenue_website_url:   map["ccavenue_website_url"]   || process.env.CCAVENUE_WEBSITE_URL          || "",
    flows_private_key:      map["flows_private_key"]      || process.env.WA_FLOWS_PRIVATE_KEY          || "",
    wa_flow_id:             map["wa_flow_id"]             || process.env.WA_FLOW_ID                    || "",
    wc_webhook_secret:           map["wc_webhook_secret"]           || process.env.WC_WEBHOOK_SECRET             || "",
    instagram_page_access_token: map["instagram_page_access_token"] || process.env.INSTAGRAM_PAGE_ACCESS_TOKEN   || "",
    instagram_verify_token:      map["instagram_verify_token"]      || process.env.INSTAGRAM_VERIFY_TOKEN        || "",
    shopify_domain:              map["shopify_domain"]              || process.env.SHOPIFY_DOMAIN                || "",
    shopify_access_token:        map["shopify_access_token"]        || process.env.SHOPIFY_ACCESS_TOKEN          || "",
    shopify_api_version:         map["shopify_api_version"]         || process.env.SHOPIFY_API_VERSION           || "2024-10",
  };
}


export { KEYS as INTEGRATION_KEYS };
