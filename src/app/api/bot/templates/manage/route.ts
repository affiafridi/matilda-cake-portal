import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function creds() {
  const businessId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!businessId || !token) throw new Error("WhatsApp not configured");
  return { businessId, token };
}

// Upload image bytes to Meta's Resumable Upload API and return an h:xxx handle.
// This is more reliable than passing a URL — Meta won't try to fetch from external hosts.
async function uploadImageToMeta(imageUrl: string, token: string): Promise<string | null> {
  try {
    const imgRes = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
    });
    if (!imgRes.ok) return null;

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const fileLength = buffer.length;

    // Step 1: Create upload session
    const sessionRes = await fetch(
      `https://graph.facebook.com/v20.0/app/uploads?file_length=${fileLength}&file_type=${encodeURIComponent(contentType)}&access_token=${token}`,
      { method: "POST" },
    );
    const sessionJson = await sessionRes.json() as { id?: string; error?: { message: string } };
    if (!sessionJson.id) return null;

    // Step 2: Upload bytes — Authorization must be "OAuth", not "Bearer"
    const uploadRes = await fetch(`https://graph.facebook.com/v20.0/${sessionJson.id}`, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: "0",
        "Content-Type": contentType,
      },
      body: new Uint8Array(buffer),
    });
    const uploadJson = await uploadRes.json() as { h?: string; error?: { message: string } };
    if (!uploadJson.h) return null;

    return uploadJson.h;
  } catch {
    return null;
  }
}

function buildMetaButton(btn: { type: string; text: string; url?: string; urlType?: string; urlExample?: string; phone?: string; example?: string }) {
  switch (btn.type) {
    case "QUICK_REPLY":  return { type: "QUICK_REPLY", text: btn.text };
    case "URL": {
      if (btn.urlType === "DYNAMIC") {
        const exampleSuffix = btn.urlExample?.trim() || "example";
        // Build full example URL: replace {{1}} in the stored URL with the suffix
        const baseUrl = (btn.url ?? "").replace(/\{\{1\}\}.*$/, "");
        const fullExample = exampleSuffix.startsWith("http") ? exampleSuffix : `${baseUrl}${exampleSuffix}`;
        return { type: "URL", text: btn.text, url: btn.url, example: [fullExample] };
      }
      return { type: "URL", text: btn.text, url: btn.url };
    }
    case "PHONE_NUMBER": return { type: "PHONE_NUMBER", text: btn.text, phone_number: btn.phone };
    case "COPY_CODE":    return { type: "COPY_CODE", text: btn.text, example: [btn.example ?? ""] };
    case "VOICE_CALL":   return { type: "VOICE_CALL", text: btn.text };
    default:             return { type: btn.type, text: btn.text };
  }
}

const buttonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1).max(25) }),
  z.object({ type: z.literal("URL"), text: z.string().min(1).max(25), url: z.string().url(), urlType: z.enum(["STATIC", "DYNAMIC"]).default("STATIC"), urlExample: z.string().optional() }),
  z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().min(1).max(25), phone: z.string().min(1) }),
  z.object({ type: z.literal("COPY_CODE"), text: z.string().min(1).max(25), example: z.string().min(1).max(15) }),
  z.object({ type: z.literal("VOICE_CALL"), text: z.string().min(1).max(25) }),
]);
type ButtonInput = z.infer<typeof buttonSchema>;

const createSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9_]+$/, "Name must be lowercase letters, numbers, underscores only"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  language: z.string().default("en"),
  headerText: z.string().optional(),
  headerImageUrl: z.string().optional(), // public URL — backend will upload to Meta
  headerHandle: z.string().optional(),   // already-uploaded h:xxx handle from MediaInput
  headerLocation: z.object({
    name: z.string().optional(),
    address: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }).optional(),
  body: z.string().min(1),
  bodyExamples: z.array(z.string()).optional(),
  footerText: z.string().optional(),
  buttons: z.array(buttonSchema).max(10).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { businessId, token } = creds();
    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

    const { name, category, language, headerText, headerImageUrl, headerHandle, headerLocation, body: bodyText, bodyExamples, footerText, buttons } = parsed.data;

    const varMatches = bodyText.match(/\{\{(\d+)\}\}/g) ?? [];
    const varCount = new Set(varMatches.map((m) => m.replace(/\{|\}/g, ""))).size;

    const components: object[] = [];

    // ── Header ─────────────────────────────────────────────────────────────
    const rawHandle = headerHandle?.trim();
    const rawUrl = headerImageUrl?.trim();

    if (rawHandle?.startsWith("h:")) {
      // Already uploaded via MediaInput drag-drop — use handle directly
      components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [rawHandle] } });
    } else if (rawUrl) {
      const lc = rawUrl.toLowerCase();
      const isVideo = lc.includes(".mp4");
      const isPdf = lc.includes(".pdf");
      const format = isVideo ? "VIDEO" : isPdf ? "DOCUMENT" : "IMAGE";

      if (!isVideo && !isPdf) {
        // For images: download and upload to Meta so Meta never needs to fetch the external URL.
        // This avoids "Invalid parameter" errors from WordPress/CDN URLs with bot protection.
        const handle = await uploadImageToMeta(rawUrl, token);
        if (handle) {
          components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [handle] } });
        } else {
          // Upload failed — fall back to URL (Meta will try to fetch it)
          components.push({ type: "HEADER", format: "IMAGE", example: { header_url: [rawUrl] } });
        }
      } else {
        // Video/PDF: pass URL directly (large files, resumable upload is complex)
        components.push({ type: "HEADER", format, example: { header_url: [rawUrl] } });
      }
    } else if (headerText?.trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: headerText.trim() });
    } else if (headerLocation) {
      const locComp: Record<string, unknown> = { type: "HEADER", format: "LOCATION" };
      if (headerLocation.name) locComp.text = headerLocation.name;
      components.push(locComp);
    }

    // ── Body ───────────────────────────────────────────────────────────────
    const bodyComp: Record<string, unknown> = { type: "BODY", text: bodyText };
    if (varCount > 0 && bodyExamples && bodyExamples.length >= varCount) {
      bodyComp.example = { body_text: [bodyExamples.slice(0, varCount)] };
    }
    components.push(bodyComp);

    // ── Footer ─────────────────────────────────────────────────────────────
    if (footerText?.trim()) {
      components.push({ type: "FOOTER", text: footerText.trim() });
    }

    // ── Buttons ────────────────────────────────────────────────────────────
    if (buttons && buttons.length > 0) {
      components.push({ type: "BUTTONS", buttons: buttons.map(buildMetaButton) });
    }

    const res = await fetch(
      `https://graph.facebook.com/v20.0/${businessId}/message_templates`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, language, components }),
      },
    );
    const json = await res.json() as {
      id?: string;
      error?: { message: string; error_user_title?: string; error_user_msg?: string; code?: number };
    };

    if (json.error) {
      // Surface the most helpful message Meta gives us
      const detail = json.error.error_user_msg ?? json.error.error_user_title ?? "";
      const msg = detail ? `${json.error.message} — ${detail}` : json.error.message;
      return jsonError(msg, 400);
    }

    return jsonOk(json);
  } catch (err) {
    return handleApiError(err);
  }
}

// PATCH — edit an existing template (can update components and category, NOT name/language)
export async function PATCH(req: NextRequest) {
  try {
    const { token } = creds();
    const body = await req.json().catch(() => ({}));

    const patchSchema = createSchema.extend({
      templateId: z.string().min(1),
    });
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

    const { templateId, category, headerText, headerImageUrl, headerHandle, headerLocation, body: bodyText, bodyExamples, footerText, buttons } = parsed.data;

    const varMatches = bodyText.match(/\{\{(\d+)\}\}/g) ?? [];
    const varCount = new Set(varMatches.map((m) => m.replace(/\{|\}/g, ""))).size;

    const components: object[] = [];

    // Header
    const rawHandle = headerHandle?.trim();
    const rawUrl = headerImageUrl?.trim();
    if (rawHandle?.startsWith("h:")) {
      components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [rawHandle] } });
    } else if (rawUrl) {
      const lc = rawUrl.toLowerCase();
      const isVideo = lc.includes(".mp4");
      const isPdf = lc.includes(".pdf");
      const format = isVideo ? "VIDEO" : isPdf ? "DOCUMENT" : "IMAGE";
      if (!isVideo && !isPdf) {
        const handle = await uploadImageToMeta(rawUrl, token);
        if (handle) {
          components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [handle] } });
        } else {
          components.push({ type: "HEADER", format: "IMAGE", example: { header_url: [rawUrl] } });
        }
      } else {
        components.push({ type: "HEADER", format, example: { header_url: [rawUrl] } });
      }
    } else if (headerText?.trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: headerText.trim() });
    } else if (headerLocation) {
      const locComp: Record<string, unknown> = { type: "HEADER", format: "LOCATION" };
      if (headerLocation.name) locComp.text = headerLocation.name;
      components.push(locComp);
    }

    // Body
    const bodyComp: Record<string, unknown> = { type: "BODY", text: bodyText };
    if (varCount > 0 && bodyExamples && bodyExamples.length >= varCount) {
      bodyComp.example = { body_text: [bodyExamples.slice(0, varCount)] };
    }
    components.push(bodyComp);

    // Footer
    if (footerText?.trim()) {
      components.push({ type: "FOOTER", text: footerText.trim() });
    }

    // Buttons
    if (buttons && buttons.length > 0) {
      components.push({ type: "BUTTONS", buttons: buttons.map(buildMetaButton) });
    }

    const res = await fetch(
      `https://graph.facebook.com/v20.0/${templateId}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ category, components }),
      },
    );
    const json = await res.json() as {
      success?: boolean;
      error?: { message: string; error_user_title?: string; error_user_msg?: string; code?: number };
    };
    if (json.error) {
      const detail = json.error.error_user_msg ?? json.error.error_user_title ?? "";
      const msg = detail ? `${json.error.message} — ${detail}` : json.error.message;
      return jsonError(msg, 400);
    }
    return jsonOk({ updated: true });
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE — delete a template by name (Meta only supports deletion by name, not by ID)
export async function DELETE(req: NextRequest) {
  try {
    const { businessId, token } = creds();
    const { name } = await req.json().catch(() => ({}));
    if (!name) return jsonError("name required", 400);

    const res = await fetch(
      `https://graph.facebook.com/v20.0/${businessId}/message_templates?name=${encodeURIComponent(name as string)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    const json = await res.json() as { error?: { message: string } };
    if (json.error) return jsonError(json.error.message, 400);
    return jsonOk({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
