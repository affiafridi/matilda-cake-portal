import { NextRequest, NextResponse } from "next/server";
import { getIntegrations } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL      = "gpt-4o-mini";

// ── Types ──────────────────────────────────────────────────────────────────

type Intent = "catalog" | "product_search" | "agent" | "info" | "unknown";

export type AiReplyResponse =
  | { type: "catalog" }
  | { type: "product_search"; query: string }
  | { type: "agent" }
  | { type: "text"; reply: string };

// ── Helpers ────────────────────────────────────────────────────────────────

async function loadAiSettings(): Promise<{
  kb: Record<string, string>;
  intents: Record<string, boolean>;
  customPrompt: string | null;
  maxTokens: number;
  dailyLimit: number;
}> {
  try {
    const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value FROM portal_settings
      WHERE key IN (
        'ai_kb_business_name','ai_kb_hours','ai_kb_location',
        'ai_kb_sizes','ai_kb_flavours','ai_kb_delivery',
        'ai_kb_custom_orders','ai_kb_extra','ai_kb_use_prompt','ai_kb_prompt',
        'ai_max_tokens','ai_daily_limit','ai_usage_date','ai_usage_count',
        'ai_intent_catalog','ai_intent_search','ai_intent_agent','ai_intent_info'
      )
    `;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const usePrompt = (map["ai_kb_use_prompt"] ?? "false") === "true";
    const rawPrompt = map["ai_kb_prompt"] ?? "";
    return {
      kb: {
        business_name: map["ai_kb_business_name"] ?? "",
        hours:         map["ai_kb_hours"]         ?? "",
        location:      map["ai_kb_location"]      ?? "",
        sizes:         map["ai_kb_sizes"]         ?? "",
        flavours:      map["ai_kb_flavours"]      ?? "",
        delivery:      map["ai_kb_delivery"]      ?? "",
        custom_orders: map["ai_kb_custom_orders"] ?? "",
        extra:         map["ai_kb_extra"]         ?? "",
      },
      intents: {
        catalog: (map["ai_intent_catalog"] ?? "true") === "true",
        search:  (map["ai_intent_search"]  ?? "true") === "true",
        agent:   (map["ai_intent_agent"]   ?? "true") === "true",
        info:    (map["ai_intent_info"]    ?? "true") === "true",
      },
      customPrompt: usePrompt && rawPrompt ? rawPrompt : null,
      maxTokens:    Number(map["ai_max_tokens"]  ?? "150"),
      dailyLimit:   Number(map["ai_daily_limit"] ?? "200"),
    };
  } catch {
    return { kb: {}, intents: { catalog: true, search: true, agent: true, info: true }, customPrompt: null, maxTokens: 150, dailyLimit: 200 };
  }
}

async function checkAndIncrementUsage(dailyLimit: number): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
    SELECT key, value FROM portal_settings WHERE key IN ('ai_usage_date','ai_usage_count')
  `;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const usageDate  = map["ai_usage_date"]  ?? "";
  const usageCount = usageDate === today ? Number(map["ai_usage_count"] ?? "0") : 0;

  if (usageCount >= dailyLimit) return false;

  const newCount = String(usageCount + 1);
  await prisma.$executeRaw`INSERT INTO portal_settings (key,value) VALUES ('ai_usage_date',${today}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`;
  await prisma.$executeRaw`INSERT INTO portal_settings (key,value) VALUES ('ai_usage_count',${newCount}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`;
  return true;
}

function buildSystemPrompt(kb: Record<string, string>): string {
  const lines = ["You are a helpful WhatsApp assistant for a business. Use only the info below to answer."];
  if (kb.business_name)  lines.push(`Business: ${kb.business_name}`);
  if (kb.hours)          lines.push(`Opening hours: ${kb.hours}`);
  if (kb.location)       lines.push(`Location: ${kb.location}`);
  if (kb.sizes)          lines.push(`Products / Services: ${kb.sizes}`);
  if (kb.flavours)       lines.push(`Pricing: ${kb.flavours}`);
  if (kb.delivery)       lines.push(`Delivery / Shipping: ${kb.delivery}`);
  if (kb.custom_orders)  lines.push(`Special requests: ${kb.custom_orders}`);
  if (kb.extra)          lines.push(`Additional info: ${kb.extra}`);
  lines.push("");
  lines.push("Reply in 1–3 short sentences. Plain text only — no markdown, no asterisks, no bullet points.");
  lines.push("If you do not know the answer from the info above, say so honestly.");
  return lines.join("\n");
}

async function classifyIntent(
  message: string,
  apiKey: string,
  enabledIntents: Record<string, boolean>,
): Promise<{ intent: Intent; query?: string }> {
  const available: string[] = [];
  if (enabledIntents.catalog) available.push('"catalog" — customer wants to see the menu, product list, or catalogue');
  if (enabledIntents.search)  available.push('"product_search" — customer is searching for a specific product, cake, or item');
  if (enabledIntents.agent)   available.push('"agent" — customer wants to talk to a human, get help, or speak to support');
  if (enabledIntents.info)    available.push('"info" — customer is asking about hours, location, sizes, flavours, delivery, or other business info');
  available.push('"unknown" — does not match any of the above');

  const prompt = [
    "Classify the following customer WhatsApp message into exactly one intent.",
    "Respond with JSON only. No explanation.",
    "",
    "Available intents:",
    ...available.map((a) => `- ${a}`),
    "",
    `If intent is "product_search", also include a "query" field with the clean search term.`,
    "",
    `Customer message: "${message}"`,
    "",
    `Respond with exactly this shape: { "intent": "<one of the above>", "query": "<only if product_search>" }`,
  ].join("\n");

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 80,
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    return { intent: parsed.intent ?? "unknown", query: parsed.query };
  } catch {
    return { intent: "unknown" };
  }
}

async function searchWooCommerce(
  query: string,
  wcUrl: string,
  key: string,
  secret: string,
): Promise<{ name: string; price: string; permalink: string }[]> {
  try {
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");
    const url  = `${wcUrl.replace(/\/$/, "")}/wp-json/wc/v3/products?search=${encodeURIComponent(query)}&per_page=5&status=publish`;
    const res  = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function generateInfoReply(
  message: string,
  systemPrompt: string,
  apiKey: string,
  maxTokens = 150,
): Promise<string> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: message },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
  });
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const {
      inbox_webhook_secret, openai_api_key,
      wc_url, wc_consumer_key, wc_consumer_secret,
    } = await getIntegrations();

    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!openai_api_key) {
      return NextResponse.json({ ok: false, error: "OpenAI not configured" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const { message, waId } = body as { message?: string; waId?: string };
    if (!message) return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });

    const { kb, intents, customPrompt, maxTokens, dailyLimit } = await loadAiSettings();
    const systemPrompt = customPrompt ?? buildSystemPrompt(kb);

    const withinLimit = await checkAndIncrementUsage(dailyLimit);
    if (!withinLimit) {
      return NextResponse.json({ ok: true, type: "text", reply: "Our AI assistant is temporarily unavailable. Please type 'agent' to speak with our team.", waId }, { status: 200 });
    }

    // Step 1 — classify intent
    const { intent, query } = await classifyIntent(message, openai_api_key, intents);

    let response: AiReplyResponse;

    if (intent === "catalog" && intents.catalog) {
      response = { type: "catalog" };

    } else if (intent === "product_search" && intents.search) {
      // Optional: search WooCommerce now if bot can't do it
      if (wc_url && wc_consumer_key) {
        const products = await searchWooCommerce(query ?? message, wc_url, wc_consumer_key, wc_consumer_secret);
        if (products.length > 0) {
          const list = products.map((p) => `• ${p.name} — £${p.price}\n  ${p.permalink}`).join("\n");
          const aiText = await generateInfoReply(
            `Customer asked: "${message}". Here are matching products:\n${list}\n\nMention them naturally with price and link.`,
            systemPrompt,
            openai_api_key,
            maxTokens,
          );
          response = { type: "text", reply: aiText };
        } else {
          response = { type: "product_search", query: query ?? message };
        }
      } else {
        response = { type: "product_search", query: query ?? message };
      }

    } else if (intent === "agent" && intents.agent) {
      response = { type: "agent" };

    } else if (intent === "info" && intents.info) {
      const reply = await generateInfoReply(message, systemPrompt, openai_api_key, maxTokens);
      response = { type: "text", reply };

    } else {
      // unknown or disabled intent — send a polite fallback
      const reply = await generateInfoReply(message, systemPrompt, openai_api_key, maxTokens);
      response = { type: "text", reply: reply || "I'm not sure about that. You can ask about our products, opening hours, or type 'menu' to see our catalog." };
    }

    return NextResponse.json({ ok: true, waId, ...response });
  } catch (e) {
    console.error("[ai-reply]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
