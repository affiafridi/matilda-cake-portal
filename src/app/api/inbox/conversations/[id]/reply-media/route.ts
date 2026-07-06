import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

/**
 * POST /api/inbox/conversations/[id]/reply-media
 * multipart/form-data: file (the media file), caption? (optional text)
 *
 * 1. Upload file to WhatsApp Cloud API → get media_id
 * 2. Send message with that media_id
 * 3. Save OUTBOUND message to DB
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(ALLOWED);
    const { id } = await params;

    const { wa_phone_number_id: phoneNumberId, wa_access_token: accessToken } = await getIntegrations();
    if (!phoneNumberId || !accessToken) return jsonError("WhatsApp credentials not configured", 500);

    const conversation = await prisma.conversation.findUnique({
      where: { id }, select: { id: true, waId: true },
    });
    if (!conversation) return jsonError("Conversation not found", 404);

    const formData = await req.formData().catch(() => null);
    if (!formData) return jsonError("Invalid form data", 400);

    const file    = formData.get("file") as File | null;
    const caption = (formData.get("caption") as string | null)?.trim() ?? "";
    if (!file) return jsonError("file is required", 400);

    const mime = file.type;
    const mediaType = mime.startsWith("image/")    ? "image"
                    : mime.startsWith("video/")    ? "video"
                    : mime.startsWith("audio/")    ? "audio"
                    : "document";

    // ── Step 1: Upload to WhatsApp media endpoint ──────────────────────────
    const uploadForm = new FormData();
    uploadForm.append("file", file, file.name);
    uploadForm.append("messaging_product", "whatsapp");

    const uploadRes = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/media`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: uploadForm },
    );
    const uploadJson = await uploadRes.json().catch(() => ({})) as { id?: string; error?: { message: string } };
    if (!uploadJson.id) {
      return jsonError(uploadJson.error?.message ?? "Media upload failed", 502);
    }
    const mediaId = uploadJson.id;

    // ── Step 2: Send WhatsApp message ─────────────────────────────────────
    const messagePayload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to:                conversation.waId,
      type:              mediaType,
      [mediaType]:       { id: mediaId, ...(caption && mediaType === "image" ? { caption } : {}) },
    };

    const sendRes  = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(messagePayload),
    });
    const sendJson = await sendRes.json().catch(() => ({})) as { messages?: { id: string }[] };
    const waMessageId = sendJson.messages?.[0]?.id ?? null;

    // ── Step 3: Save to DB — no mediaUrl stored (Meta URLs expire after 30d) ──
    const now = new Date();
    await prisma.$transaction([
      prisma.message.create({
        data: {
          id:             crypto.randomUUID(),
          conversationId: id,
          waMessageId,
          direction:      "OUTBOUND",
          messageStatus:  "SENT",
          body:           caption || `[${mediaType}]`,
          mediaUrl:       null,
          mediaType,
          sentById:       actor.id,
          createdAt:      now,
        },
      }),
      prisma.conversation.update({
        where: { id },
        data:  {
          lastMessageAt:    now,
          lastMessageBody:  caption ? `${caption} [${mediaType}]` : `[${mediaType}]`,
          lastHumanReplyAt: now,
          botPaused:        true,
          status:           "OPEN",
        },
      }),
    ]);

    return jsonOk({ ok: true, mediaType });
  } catch (err) {
    return handleApiError(err);
  }
}
