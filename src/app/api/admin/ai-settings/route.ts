import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AI_KB_KEYS = [
  "ai_kb_business_name",
  "ai_kb_hours",
  "ai_kb_location",
  "ai_kb_sizes",
  "ai_kb_flavours",
  "ai_kb_delivery",
  "ai_kb_custom_orders",
  "ai_kb_extra",
  "ai_kb_use_prompt",
  "ai_kb_prompt",
  "ai_max_tokens",
  "ai_daily_limit",
] as const;

const AI_INTENT_KEYS = [
  "ai_intent_catalog",
  "ai_intent_search",
  "ai_intent_agent",
  "ai_intent_info",
] as const;

type AiSettings = {
  openai_configured: boolean;
  ai_kb_business_name: string;
  ai_kb_hours: string;
  ai_kb_location: string;
  ai_kb_sizes: string;
  ai_kb_flavours: string;
  ai_kb_delivery: string;
  ai_kb_custom_orders: string;
  ai_kb_extra: string;
  ai_kb_use_prompt: boolean;
  ai_kb_prompt: string;
  ai_max_tokens: number;
  ai_daily_limit: number;
  ai_intent_catalog: boolean;
  ai_intent_search: boolean;
  ai_intent_agent: boolean;
  ai_intent_info: boolean;
  ai_usage_today: number;
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const { openai_api_key } = await getIntegrations();

    const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value FROM portal_settings
      WHERE key IN (
        'ai_kb_business_name','ai_kb_hours','ai_kb_location',
        'ai_kb_sizes','ai_kb_flavours','ai_kb_delivery',
        'ai_kb_custom_orders','ai_kb_extra','ai_kb_use_prompt','ai_kb_prompt',
        'ai_max_tokens','ai_daily_limit',
        'ai_intent_catalog','ai_intent_search','ai_intent_agent','ai_intent_info',
        'ai_usage_date','ai_usage_count'
      )
    `;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    return jsonOk({
      openai_configured: !!openai_api_key,
      ai_kb_business_name:  map["ai_kb_business_name"]  ?? "",
      ai_kb_hours:          map["ai_kb_hours"]          ?? "",
      ai_kb_location:       map["ai_kb_location"]       ?? "",
      ai_kb_sizes:          map["ai_kb_sizes"]          ?? "",
      ai_kb_flavours:       map["ai_kb_flavours"]       ?? "",
      ai_kb_delivery:       map["ai_kb_delivery"]       ?? "",
      ai_kb_custom_orders:  map["ai_kb_custom_orders"]  ?? "",
      ai_kb_extra:          map["ai_kb_extra"]          ?? "",
      ai_kb_use_prompt:     (map["ai_kb_use_prompt"]    ?? "false") === "true",
      ai_kb_prompt:         map["ai_kb_prompt"]         ?? "",
      ai_max_tokens:        Number(map["ai_max_tokens"] ?? "150"),
      ai_daily_limit:       Number(map["ai_daily_limit"] ?? "200"),
      ai_intent_catalog:    (map["ai_intent_catalog"]   ?? "true") === "true",
      ai_intent_search:     (map["ai_intent_search"]    ?? "true") === "true",
      ai_intent_agent:      (map["ai_intent_agent"]     ?? "true") === "true",
      ai_intent_info:       (map["ai_intent_info"]      ?? "true") === "true",
      ai_usage_today:       map["ai_usage_date"] === new Date().toISOString().slice(0, 10)
                              ? Number(map["ai_usage_count"] ?? "0")
                              : 0,
    } satisfies AiSettings);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const body = await req.json() as Record<string, string | boolean>;

    for (const [key, value] of Object.entries(body)) {
      if (![...AI_KB_KEYS, ...AI_INTENT_KEYS].includes(key as never)) continue;
      const strVal = String(value);
      await prisma.$executeRaw`
        INSERT INTO portal_settings (key, value) VALUES (${key}, ${strVal})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }

    return jsonOk({ saved: true });
  } catch (err) {
    return handleApiError(err);
  }
}
