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
];

/** Read integration credentials from DB, falling back to env vars. */
export async function getIntegrations(): Promise<IntegrationSettings> {
  let map: Record<string, string> = {};
  try {
    const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value FROM portal_settings
      WHERE key IN (
        'wa_access_token', 'wa_phone_number_id', 'wa_business_account_id',
        'wc_url', 'wc_consumer_key', 'wc_consumer_secret',
        'bot_url', 'sync_secret', 'inbox_webhook_secret',
        'openai_api_key'
      )
    `;
    map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
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
  };
}

export { KEYS as INTEGRATION_KEYS };
