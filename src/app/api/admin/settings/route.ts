import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { cacheDel } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value FROM portal_settings
      WHERE key IN (
        'woo_visible_to_admin', 'ai_visible_to_admin', 'wa_visible_to_admin', 'portal_visible_to_admin', 'integrations_visible_to_admin',
        'app_name', 'primary_color', 'accent_color', 'sidebar_color', 'logo_url', 'inbox_template_name',
        'contact_phone', 'contact_email', 'contact_website', 'contact_welcome_image', 'contact_team_numbers',
        'instagram_bot_enabled'
      )
    `;

    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return jsonOk({
      woo_visible_to_admin:          (map["woo_visible_to_admin"]          ?? "false") === "true",
      ai_visible_to_admin:           (map["ai_visible_to_admin"]           ?? "false") === "true",
      wa_visible_to_admin:           (map["wa_visible_to_admin"]           ?? "true")  === "true",
      portal_visible_to_admin:       (map["portal_visible_to_admin"]       ?? "true")  === "true",
      integrations_visible_to_admin: (map["integrations_visible_to_admin"] ?? "false") === "true",
      app_name:      map["app_name"]      ?? "Order Portal",
      primary_color: map["primary_color"] ?? "#2563eb",
      accent_color:  map["accent_color"]  ?? "#0891b2",
      sidebar_color: map["sidebar_color"] ?? "#ffffff",
      logo_url:            map["logo_url"]            ?? "/uploads/logo.png",
      inbox_template_name: map["inbox_template_name"] ?? "conversation_followup",
      contact_phone:         map["contact_phone"]         ?? "",
      contact_email:         map["contact_email"]         ?? "",
      contact_website:       map["contact_website"]       ?? "",
      contact_welcome_image: map["contact_welcome_image"] ?? "",
      contact_team_numbers:  map["contact_team_numbers"]  ?? "",
      instagram_bot_enabled: (map["instagram_bot_enabled"] ?? "true") === "true",
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const INTEGRATION_KEYS = [
  "wa_access_token", "wa_phone_number_id", "wa_business_account_id",
  "wc_url", "wc_consumer_key", "wc_consumer_secret", "wc_webhook_secret",
  "bot_url", "sync_secret", "inbox_webhook_secret",
  "google_oauth_client_id", "google_oauth_client_secret",
  "openai_api_key",
  "ccavenue_merchant_id",
  "ccavenue_access_code",
  "ccavenue_working_key",
  "ccavenue_website_url",
  "flows_private_key",
  "wa_flow_id",
  "instagram_page_access_token",
  "instagram_verify_token",
];

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const body = await req.json() as { key: string; value: boolean | string };
    const allowed = [
      "woo_visible_to_admin", "ai_visible_to_admin", "wa_visible_to_admin", "portal_visible_to_admin", "integrations_visible_to_admin", "app_name",
      "primary_color", "accent_color", "sidebar_color", "logo_url",
      "inbox_template_name",
      "contact_phone", "contact_email", "contact_website", "contact_welcome_image", "contact_team_numbers",
      "instagram_bot_enabled",
      ...INTEGRATION_KEYS,
    ];
    if (!allowed.includes(body.key)) return jsonError("Invalid key", 400);

    // ADMIN can only save integration keys if the toggle is enabled
    if (user.role === "ADMIN" && INTEGRATION_KEYS.includes(body.key)) {
      const rows = await prisma.$queryRaw<{ value: string }[]>`SELECT value FROM portal_settings WHERE key = 'integrations_visible_to_admin'`;
      if ((rows[0]?.value ?? "false") !== "true") return jsonError("Forbidden", 403);
    }

    const strVal = String(body.value);
    await prisma.$executeRaw`
      INSERT INTO portal_settings (key, value) VALUES (${body.key}, ${strVal})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;

    cacheDel("ai_settings");

    return jsonOk({ [body.key]: body.value });
  } catch (err) {
    return handleApiError(err);
  }
}
