import { NextRequest, NextResponse } from "next/server";
import { getIntegrations } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_URL    = "https://api.openai.com/v1/chat/completions";
const MODEL         = "gpt-4o-mini";
const VISION_MODEL  = "gpt-4o";

// ── Types ──────────────────────────────────────────────────────────────────

type Intent = "catalog" | "product_search" | "agent" | "info" | "order" | "unknown";

export type AiReplyResponse =
  | { type: "catalog" }
  | { type: "product_search"; query: string }
  | { type: "agent" }
  | { type: "order" }
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
  const lines = [
    `You are a helpful WhatsApp customer assistant${kb.business_name ? ` for ${kb.business_name}` : ""}. Answer using only the information provided below.`,
  ];
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
  lines.push("If you do not know the answer from the information above, say so honestly and suggest the customer contact the team directly.");
  return lines.join("\n");
}

type ImageInput = { base64: string; mimeType: string };

async function classifyIntent(
  message: string,
  apiKey: string,
  enabledIntents: Record<string, boolean>,
  systemPrompt: string,
  image?: ImageInput,
): Promise<{ intent: Intent; query?: string }> {
  const available: string[] = [];
  if (enabledIntents.search)  available.push('"product_search" — customer is looking for or asking about a specific product or item');
  if (enabledIntents.catalog) available.push('"catalog" — customer wants to browse the menu, categories, or full product list');
  available.push('"order" — customer explicitly wants to place or confirm an order right now');
  if (enabledIntents.agent)   available.push('"agent" — customer wants to talk to a human or get support');
  if (enabledIntents.info)    available.push('"info" — customer is asking a factual question about the business with no product or menu mention');
  available.push('"unknown" — greeting, thank you, or off-topic');

  const promptText = [
    "Using the business context in the system prompt, classify the customer message into exactly one intent.",
    "Respond with JSON only. No explanation.",
    image ? "The customer has also sent an image — use its contents to help classify." : "",
    "",
    "Rules:",
    "- Use catalog when the customer asks about categories, menu, or products in general",
    "- Use product_search when a specific product, type, or occasion is mentioned (or when the image shows a product/design they want)",
    "- Use order only when the customer explicitly says they want to place an order",
    "- Use info for business questions (hours, location, delivery) with no product mention",
    "",
    "Available intents:",
    ...available.map((a) => `- ${a}`),
    "",
    `If intent is "product_search", include a "query" field with the clean search term extracted from the message and/or image.`,
    "",
    message ? `Customer message: "${message}"` : `Customer sent an image with no text.`,
    "",
    `Respond with exactly: { "intent": "<intent>", "query": "<search term if product_search>" }`,
  ].filter(Boolean).join("\n");

  // Build user content — include image as data URI when provided
  const userContent = image
    ? [
        { type: "text",      text: promptText },
        { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: "low" } },
      ]
    : promptText;

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model:           image ? VISION_MODEL : MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent },
      ],
      max_tokens:      80,
      temperature:     0,
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


async function generateInfoReply(
  message: string,
  systemPrompt: string,
  apiKey: string,
  maxTokens = 150,
  image?: ImageInput,
): Promise<string> {
  const userContent = image
    ? [
        { type: "text",      text: message },
        { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: "low" } },
      ]
    : message;

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model:       image ? VISION_MODEL : MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent },
      ],
      max_tokens:  maxTokens,
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
    } = await getIntegrations();

    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!openai_api_key) {
      return NextResponse.json({ ok: false, error: "OpenAI not configured" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const { message: rawMessage, waId, image } = body as { message?: string; waId?: string; image?: ImageInput };
    const message = rawMessage ?? "";
    if (!message && !image) return NextResponse.json({ ok: false, error: "message or image is required" }, { status: 400 });

    const { kb, intents, customPrompt, maxTokens, dailyLimit } = await loadAiSettings();
    const systemPrompt = customPrompt ?? buildSystemPrompt(kb);

    // Classify intent first — no usage cost for routing-only intents
    const { intent, query } = await classifyIntent(message, openai_api_key, intents, systemPrompt, image);

    let response: AiReplyResponse;

    if (intent === "order") {
      response = { type: "order" };

    } else if (intent === "catalog" && intents.catalog) {
      response = { type: "catalog" };

    } else if (intent === "agent" && intents.agent) {
      response = { type: "agent" };

    } else if (intent === "product_search" && intents.search) {
      // Always return product_search so the bot renders its own product card UI.
      // Never generate an AI text reply here — WhatsApp doesn't render markdown links.
      response = { type: "product_search", query: query ?? message };

    } else if (intent === "unknown") {
      // Greetings / off-topic — don't burn daily limit, let bot use its own response
      response = { type: "text", reply: "" };

    } else {
      // info or disabled intents — generate AI text reply
      const withinLimit = await checkAndIncrementUsage(dailyLimit);
      if (!withinLimit) return NextResponse.json({ ok: false, error: "daily_limit_reached" }, { status: 429 });
      const reply = await generateInfoReply(message, systemPrompt, openai_api_key, maxTokens, image);
      response = { type: "text", reply: reply || "" };
    }

    return NextResponse.json({ ok: true, waId, ...response });
  } catch (e) {
    console.error("[ai-reply]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
