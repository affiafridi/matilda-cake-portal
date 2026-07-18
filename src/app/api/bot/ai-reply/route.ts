import { NextRequest, NextResponse } from "next/server";
import { getIntegrations } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet, cacheOr, TTL } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_URL   = "https://api.openai.com/v1/chat/completions";
const MODEL        = "gpt-4o-mini";
const VISION_MODEL = "gpt-4o";

// ── Types ──────────────────────────────────────────────────────────────────

type Intent = "catalog" | "product_search" | "agent" | "info" | "order" | "unknown";

export type AiReplyResponse =
  | { type: "catalog" }
  | { type: "product_search"; query: string }
  | { type: "agent" }
  | { type: "order" }
  | { type: "text"; reply: string };

type AiSettings = {
  kb: Record<string, string>;
  intents: Record<string, boolean>;
  customPrompt: string | null;
  maxTokens: number;
  dailyLimit: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function loadAiSettings(): Promise<AiSettings> {
  return cacheOr<AiSettings>("ai_settings", TTL.AI_SETTINGS, async () => {
    try {
      const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
        SELECT key, value FROM portal_settings
        WHERE key IN (
          'ai_kb_business_name','ai_kb_hours','ai_kb_location',
          'ai_kb_sizes','ai_kb_flavours','ai_kb_delivery',
          'ai_kb_custom_orders','ai_kb_extra','ai_kb_use_prompt','ai_kb_prompt',
          'ai_max_tokens','ai_daily_limit',
          'ai_intent_catalog','ai_intent_search','ai_intent_agent','ai_intent_info'
        )
      `;
      const map        = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      const usePrompt  = (map["ai_kb_use_prompt"] ?? "false") === "true";
      const rawPrompt  = map["ai_kb_prompt"] ?? "";
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
      return { kb: { business_name: "", hours: "", location: "", sizes: "", flavours: "", delivery: "", custom_orders: "", extra: "" }, intents: { catalog: true, search: true, agent: true, info: true }, customPrompt: null, maxTokens: 150, dailyLimit: 200 };
    }
  });
}

async function checkAndIncrementUsage(dailyLimit: number): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);

  // Always read from DB — safe across multiple Cloud Run container instances
  let currentCount = 0;
  try {
    const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value FROM portal_settings WHERE key IN ('ai_usage_date','ai_usage_count')
    `;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    currentCount = map["ai_usage_date"] === today ? Number(map["ai_usage_count"] ?? "0") : 0;
  } catch { /* treat as 0 on DB error */ }

  if (currentCount >= dailyLimit) return false;

  // Persist incremented count to DB
  const newCount = String(currentCount + 1);
  await Promise.all([
    prisma.$executeRaw`INSERT INTO portal_settings (key,value) VALUES ('ai_usage_date',${today}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    prisma.$executeRaw`INSERT INTO portal_settings (key,value) VALUES ('ai_usage_count',${newCount}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
  ]).catch(() => { /* non-critical — allow reply even if count fails to save */ });

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
type AudioInput = { base64: string; mimeType: string };

// Stable cache key for a message — images are not cached (too large + unique)
function intentCacheKey(message: string): string {
  return `intent:${message.toLowerCase().trim().slice(0, 200)}`;
}

async function classifyIntent(
  message: string,
  apiKey: string,
  enabledIntents: Record<string, boolean>,
  systemPrompt: string,
  image?: ImageInput,
): Promise<{ intent: Intent; query?: string }> {
  // Only cache text-only messages — image content is unique each time
  if (!image) {
    const cached = cacheGet<{ intent: Intent; query?: string }>(intentCacheKey(message));
    if (cached) return cached;
  }

  const available: string[] = [];
  if (enabledIntents.search)  available.push('"product_search" — customer mentions any specific product, food item, flavour, design, or occasion (e.g. birthday, wedding, anniversary)');
  if (enabledIntents.catalog) available.push('"catalog" — customer wants to browse, see options, or asks what is available without naming something specific');
  available.push('"order" — customer explicitly says they want to order or place an order right now');
  if (enabledIntents.agent)   available.push('"agent" — customer asks for a human, support, or help from a person');
  if (enabledIntents.info)    available.push('"info" — customer asks a factual question about hours, location, delivery, pricing, or policies — with NO product or menu mention');
  available.push('"unknown" — ONLY for pure greetings (hi, hello, salam), thank-you messages, or single-word replies with no request');

  const promptText = [
    "Using the business context in the system prompt, classify the customer message into exactly one intent.",
    "Respond with JSON only. No explanation.",
    image ? "The customer has also sent an image — use its contents to help classify." : "",
    "",
    "Classification rules (apply in order, stop at first match):",
    "1. If the message mentions ANY specific food, cake, product, flavour, design, size, or occasion → product_search",
    "2. If the message asks to see the menu, what is available, what you have, your products, or wants to browse → catalog",
    "3. If the message explicitly says 'I want to order' or 'place an order' → order",
    "4. If the message asks for a human agent or support → agent",
    "5. If the message asks a factual business question (hours, location, delivery) with NO product mention → info",
    "6. Only use unknown if the message is PURELY a greeting (hi, hello, thanks, ok, bye) with absolutely no request",
    "",
    "Examples:",
    '  "show me your cakes" → catalog',
    '  "what do you have" → catalog',
    '  "do you have chocolate cake" → product_search, query: "chocolate cake"',
    '  "I want something for a birthday" → product_search, query: "birthday cake"',
    '  "what flavours do you have" → product_search, query: "flavours"',
    '  "how much does a cake cost" → info',
    '  "what are your opening hours" → info',
    '  "hi" → unknown',
    '  "thanks" → unknown',
    "",
    "Available intents:",
    ...available.map((a) => `- ${a}`),
    "",
    `If intent is "product_search", include a "query" field with the clean search term (what the customer wants to find).`,
    "",
    message ? `Customer message: "${message}"` : `Customer sent an image with no text.`,
    "",
    `Respond with exactly: { "intent": "<intent>", "query": "<search term if product_search>" }`,
  ].filter(Boolean).join("\n");

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
  const raw  = data.choices?.[0]?.message?.content ?? "{}";
  let result: { intent: Intent; query?: string };
  try {
    const parsed = JSON.parse(raw);
    result = { intent: parsed.intent ?? "unknown", query: parsed.query };
  } catch {
    result = { intent: "unknown" };
  }

  // Cache text-only classification results
  if (!image) cacheSet(intentCacheKey(message), result, TTL.AI_INTENT);

  return result;
}

async function generateInfoReply(
  message: string,
  systemPrompt: string,
  apiKey: string,
  maxTokens = 150,
  image?: ImageInput,
): Promise<string> {
  // Cache text-only info replies — same question gets same answer
  const cacheKey = !image ? `info_reply:${message.toLowerCase().trim().slice(0, 200)}` : null;
  if (cacheKey) {
    const cached = cacheGet<string>(cacheKey);
    if (cached) return cached;
  }

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
  const data  = await res.json();
  const reply = (data.choices?.[0]?.message?.content ?? "").trim();

  if (cacheKey && reply) cacheSet(cacheKey, reply, TTL.AI_INTENT);

  return reply;
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // getIntegrations() is now cached — no DB hit on warm requests
    const { inbox_webhook_secret, openai_api_key } = await getIntegrations();

    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!openai_api_key) {
      return NextResponse.json({ ok: false, error: "OpenAI not configured" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const { message: rawMessage, waId, image, audio } = body as { message?: string; waId?: string; image?: ImageInput; audio?: AudioInput };
    let message = rawMessage ?? "";
    if (!message && !image && !audio) return NextResponse.json({ ok: false, error: "message, image, or audio is required" }, { status: 400 });

    // Transcribe audio via Whisper before intent classification
    if (audio) {
      const audioBuffer = Buffer.from(audio.base64, "base64");
      const ext = audio.mimeType.split("/")[1]?.split(";")[0] ?? "ogg";
      const formData = new FormData();
      formData.append("file", new Blob([audioBuffer], { type: audio.mimeType }), `audio.${ext}`);
      formData.append("model", "whisper-1");
      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openai_api_key}` },
        body: formData,
      });
      const whisperJson = await whisperRes.json() as { text?: string; error?: { message: string } };
      message = (whisperJson.text ?? "").trim();
      // If transcription returned nothing (silent audio, noise), tell the bot so it
      // can prompt the customer to speak again — don't classify an empty string.
      if (!message) {
        return NextResponse.json({ ok: true, waId, type: "text", reply: "" });
      }
    }

    // loadAiSettings() is now cached — no DB hit on warm requests
    const { kb, intents, customPrompt, maxTokens, dailyLimit } = await loadAiSettings();
    const systemPrompt = customPrompt ?? buildSystemPrompt(kb);

    // classifyIntent() is cached for text-only messages
    const { intent, query } = await classifyIntent(message, openai_api_key, intents, systemPrompt, image);

    let response: AiReplyResponse;

    if (intent === "order") {
      response = { type: "order" };

    } else if (intent === "catalog" && intents.catalog) {
      response = { type: "catalog" };

    } else if (intent === "agent" && intents.agent) {
      response = { type: "agent" };

    } else if (intent === "product_search" && intents.search) {
      response = { type: "product_search", query: query ?? message };

    } else if (intent === "unknown") {
      // Pure greetings/thanks return empty so the bot can handle them natively.
      // But if the message has real content (>4 words or >20 chars) the model may
      // have misfired — fall back to catalog so the customer sees something useful.
      const wordCount = message.trim().split(/\s+/).length;
      const isSubstantive = wordCount > 4 || message.trim().length > 20;
      response = (intents.catalog && isSubstantive)
        ? { type: "catalog" }
        : { type: "text", reply: "" };

    } else {
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
