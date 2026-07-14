import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTEGRATION_KEYS = [
  "wa_access_token", "wa_phone_number_id", "wa_business_account_id",
  "wc_url", "wc_consumer_key", "wc_consumer_secret",
  "bot_url", "sync_secret", "inbox_webhook_secret",
  "google_oauth_client_id", "google_oauth_client_secret",
  "openai_api_key",
  "ccavenue_merchant_id", "ccavenue_access_code", "ccavenue_working_key", "ccavenue_website_url",
  "flows_private_key",
  "wa_flow_id",
];

async function canAccessIntegrations(user: { role: string } | null): Promise<boolean> {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role !== "ADMIN") return false;
  const rows = await prisma.$queryRaw<{ value: string }[]>`SELECT value FROM portal_settings WHERE key = 'integrations_visible_to_admin'`;
  return (rows[0]?.value ?? "false") === "true";
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!await canAccessIntegrations(user)) return jsonError("Forbidden", 403);

    const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value FROM portal_settings
      WHERE key IN (
        'wa_access_token', 'wa_phone_number_id', 'wa_business_account_id',
        'wc_url', 'wc_consumer_key', 'wc_consumer_secret',
        'bot_url', 'sync_secret', 'inbox_webhook_secret',
        'google_oauth_client_id', 'google_oauth_client_secret',
        'openai_api_key',
        'ccavenue_merchant_id', 'ccavenue_access_code', 'ccavenue_working_key', 'ccavenue_website_url',
        'flows_private_key', 'wa_flow_id'
      )
    `;

    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    // Return actual values for editing (page is Super Admin only)
    // Fall back to env vars so existing deployments still show their config
    const data: Record<string, string> = {};
    for (const key of INTEGRATION_KEYS) {
      data[key] = map[key] ?? envFallback(key);
    }

    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}

function envFallback(key: string): string {
  const map: Record<string, string | undefined> = {
    wa_access_token:          process.env.WHATSAPP_ACCESS_TOKEN,
    wa_phone_number_id:       process.env.WHATSAPP_PHONE_NUMBER_ID,
    wa_business_account_id:   process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    wc_url:                   process.env.WOOCOMMERCE_URL,
    wc_consumer_key:          process.env.WOOCOMMERCE_CONSUMER_KEY,
    wc_consumer_secret:       process.env.WOOCOMMERCE_CONSUMER_SECRET,
    bot_url:                  process.env.BOT_URL,
    sync_secret:              process.env.SYNC_SECRET,
    inbox_webhook_secret:     process.env.INBOX_WEBHOOK_SECRET,
    openai_api_key:           process.env.OPENAI_API_KEY,
    ccavenue_merchant_id:     process.env.CCAVENUE_MERCHANT_ID,
    ccavenue_access_code:     process.env.CCAVENUE_ACCESS_CODE,
    ccavenue_working_key:     process.env.CCAVENUE_WORKING_KEY,
    ccavenue_website_url:     process.env.CCAVENUE_WEBSITE_URL,
    flows_private_key:        process.env.WA_FLOWS_PRIVATE_KEY,
    wa_flow_id:               process.env.WA_FLOW_ID,
  };
  return map[key] ?? "";
}
