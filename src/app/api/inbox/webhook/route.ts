import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";
import { appendCustomerRow, isSheetsConfigured } from "@/lib/googlesheets";
import { pgNotify } from "@/lib/sse-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inbox/webhook
 *
 * Two payload shapes accepted:
 *
 * 1. Inbound message (from bot server):
 * { secret, waId, name, messageId, body, mediaUrl, mediaType, timestamp }
 *
 * 2. Message status update (sent/delivered/read from bot server):
 * { secret, type: "status", waMessageId, status: "sent"|"delivered"|"read" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonError("Invalid JSON", 400);

    const { inbox_webhook_secret: WEBHOOK_SECRET } = await getIntegrations();
    if (!WEBHOOK_SECRET || body.secret !== WEBHOOK_SECRET) {
      return jsonError("Unauthorized", 401);
    }

    // ── Status update ──────────────────────────────────────────────────────
    if (body.type === "status") {
      const { waMessageId, status } = body as { waMessageId: string; status: string };
      if (!waMessageId || !status) return jsonError("waMessageId and status are required", 400);

      const STATUS_MAP: Record<string, string> = {
        sent:      "SENT",
        delivered: "DELIVERED",
        read:      "READ",
        failed:    "FAILED",
      };
      const mapped = STATUS_MAP[status];
      if (!mapped) return jsonOk({ skipped: true });

      const now = new Date();

      // Update inbox message status
      await prisma.message.updateMany({
        where: { waMessageId },
        data:  { messageStatus: mapped },
      });

      // Update broadcast recipient status + timestamps
      const recipient = await prisma.broadcastRecipient.findUnique({
        where:  { waMessageId },
        select: { id: true, broadcastId: true, status: true },
      });

      if (recipient) {
        const prev = recipient.status;
        const recipientData: Record<string, unknown> = { status: mapped };
        const broadcastInc: Record<string, unknown> = {};

        if (mapped === "DELIVERED" && prev !== "DELIVERED" && prev !== "READ") {
          recipientData.deliveredAt = now;
          broadcastInc.deliveredCount = { increment: 1 };
        } else if (mapped === "READ" && prev !== "READ") {
          recipientData.readAt = now;
          broadcastInc.readCount = { increment: 1 };
          // If we somehow missed the delivered webhook, set deliveredAt too
          if (recipient.status !== "DELIVERED" && prev !== "READ") {
            recipientData.deliveredAt = now;
            broadcastInc.deliveredCount = { increment: 1 };
          }
        } else if (mapped === "FAILED" && prev !== "FAILED") {
          recipientData.failedAt = now;
          broadcastInc.failedCount = { increment: 1 };
        }

        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data:  recipientData,
        });

        if (Object.keys(broadcastInc).length > 0) {
          await prisma.broadcast.update({
            where: { id: recipient.broadcastId },
            data:  broadcastInc,
          });
        }
      }

      // Notify SSE clients of status change
      const statusConv = await prisma.message.findUnique({ where: { waMessageId }, select: { conversationId: true } });
      if (statusConv) pgNotify({ type: "message_status", conversationId: statusConv.conversationId }).catch(() => {});

      return jsonOk({ ok: true });
    }

    // ── Outbound bot message ───────────────────────────────────────────────
    if (body.type === "outbound") {
      const { waId: rawWaId, messageId, body: text, mediaUrl, mediaType, metadata, timestamp } = body as {
        waId:      string;
        messageId: string;
        body:      string | null;
        mediaUrl:  string | null;
        mediaType: string | null;
        metadata:  unknown;
        timestamp: number;
      };
      if (!rawWaId) return jsonError("waId is required", 400);

      // Normalize waId — strip leading + so "971x" and "+971x" both match
      const waId = rawWaId.replace(/^\+/, "");
      const msgTime = timestamp ? new Date(timestamp * 1000) : new Date();

      const conv = await prisma.conversation.findUnique({ where: { waId }, select: { id: true } });
      if (!conv) {
        console.warn("[inbox/webhook] outbound: no conversation found for waId:", waId, "(raw:", rawWaId, ")");
        return jsonOk({ skipped: true, reason: "no_conversation" });
      }

      const existing = messageId
        ? await prisma.message.findUnique({ where: { waMessageId: messageId }, select: { id: true } })
        : null;

      if (!existing) {
        await prisma.message.create({
          data: {
            id:             crypto.randomUUID(),
            conversationId: conv.id,
            waMessageId:    messageId ?? null,
            direction:      "OUTBOUND",
            body:           text ?? null,
            mediaUrl:       mediaUrl ?? null,
            mediaType:      mediaType ?? null,
            metadata:       metadata ? JSON.stringify(metadata) : null,
            createdAt:      msgTime,
          },
        });
        await prisma.conversation.update({
          where: { id: conv.id },
          data:  { lastMessageAt: msgTime, lastMessageBody: text ?? mediaType ?? "Bot message" },
        });
        pgNotify({ type: "message_new", conversationId: conv.id, waId }).catch(() => {});
      }
      return jsonOk({ ok: true });
    }

    // ── Inbound message ────────────────────────────────────────────────────
    const { waId: rawWaIdIn, name, messageId, body: text, mediaUrl, mediaType, timestamp } = body as {
      waId:      string;
      name:      string;
      messageId: string;
      body:      string | null;
      mediaUrl:  string | null;
      mediaType: string | null;
      timestamp: number;
    };

    // Normalize waId — strip leading + so both sides always match
    const waId = rawWaIdIn?.replace(/^\+/, "");

    if (!waId || !messageId) return jsonError("waId and messageId are required", 400);

    const msgTime = timestamp ? new Date(timestamp * 1000) : new Date();

    // Upsert customer — creates on first message, updates name if it changed
    const customer = await prisma.customer.upsert({
      where:  { phone: waId },
      create: { id: crypto.randomUUID(), name: name || waId, phone: waId, whatsappNumber: waId },
      update: { name: name || waId, whatsappNumber: waId },
      select: { id: true },
    });

    // Check if agent is involved before upserting — unread count only increments
    // when a human agent has taken over (botPaused) or the customer requested one.
    const existingConv = await prisma.conversation.findUnique({
      where:  { waId },
      select: { agentRequested: true, botPaused: true },
    });
    const agentInvolved = existingConv ? (existingConv.agentRequested || existingConv.botPaused) : false;

    const conversation = await prisma.conversation.upsert({
      where:  { waId },
      create: {
        id:              crypto.randomUUID(),
        waId,
        customerName:    name || waId,
        customerId:      customer.id,
        lastMessageAt:   msgTime,
        lastInboundAt:   msgTime,
        lastMessageBody: text ?? mediaType ?? null,
        unreadCount:     0,
      },
      update: {
        customerName:    name || waId,
        customerId:      customer.id,
        lastMessageAt:   msgTime,
        lastInboundAt:   msgTime,
        lastMessageBody: text ?? mediaType ?? null,
        ...(agentInvolved && { unreadCount: { increment: 1 } }),
        status:          "OPEN",
      },
    });

    // Auto-sync new WhatsApp contacts to Google Sheets (Instagram contacts are excluded)
    if (!waId.startsWith("ig_") && (await isSheetsConfigured()) && conversation.unreadCount === 1) {
      appendCustomerRow({ phone: waId, name: name || waId, firstSeen: msgTime }).catch(() => {});
    }

    // ── STOP / START opt-out handling ─────────────────────────────────────
    const keyword = text?.trim().toUpperCase();
    if (keyword === "STOP" || keyword === "START") {
      const optOut = keyword === "STOP";
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          broadcastOptOut:   optOut,
          broadcastOptOutAt: optOut ? msgTime : null,
        },
      });

      // Store system message so agents can see the opt-out event in the thread
      const systemBody = optOut
        ? "Customer replied STOP — unsubscribed from broadcasts."
        : "Customer replied START — re-subscribed to broadcasts.";
      await prisma.message.create({
        data: {
          id:             crypto.randomUUID(),
          conversationId: conversation.id,
          waMessageId:    messageId,
          direction:      "INBOUND",
          body:           text,
          createdAt:      msgTime,
        },
      });
      // System event so agents can see it clearly
      await prisma.message.create({
        data: {
          id:             crypto.randomUUID(),
          conversationId: conversation.id,
          direction:      "SYSTEM",
          body:           systemBody,
          createdAt:      new Date(msgTime.getTime() + 1),
        },
      });

      // Notify the bot to send an auto-reply confirmation
      const { inbox_webhook_secret, bot_url } = await getIntegrations();
      if (bot_url && inbox_webhook_secret) {
        const replyText = optOut
          ? "You have been unsubscribed from our broadcast messages. Reply START at any time to re-subscribe."
          : "You have been re-subscribed to our broadcast messages. Reply STOP at any time to unsubscribe.";
        fetch(`${bot_url}/send-message`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", "x-inbox-secret": inbox_webhook_secret },
          body:    JSON.stringify({ waId, message: replyText }),
        }).catch(() => {});
      }

      pgNotify({ type: "conv_updated", conversationId: conversation.id }).catch(() => {});
      return jsonOk({ ok: true, action: optOut ? "opted_out" : "opted_in" });
    }

    const existing = await prisma.message.findUnique({
      where:  { waMessageId: messageId },
      select: { id: true },
    });

    if (!existing) {
      // If bot sent a body placeholder like "image"/"video"/"audio"/"sticker"/"document"
      // but no mediaUrl, try to resolve the media ID from Meta using the messageId.
      // Meta message ID (wamid.xxx) → GET /v22.0/{messageId} is NOT a valid media endpoint.
      // Instead the bot should send the media_id. If mediaUrl is a numeric string, it IS the media_id.
      let resolvedMediaUrl = mediaUrl ?? null;
      let resolvedMediaType = mediaType ?? null;
      const MEDIA_BODIES = new Set(["image", "video", "audio", "sticker", "document", "voice"]);

      // If bot sent numeric media ID as mediaUrl OR as body with no mediaUrl, store as proxy URL
      if (resolvedMediaUrl && /^\d+$/.test(resolvedMediaUrl)) {
        resolvedMediaUrl = `/api/bot/media/inbound?id=${resolvedMediaUrl}`;
      }

      // If no mediaUrl but body is a media type placeholder, try to fetch media ID from Meta
      if (!resolvedMediaUrl && text && MEDIA_BODIES.has(text.toLowerCase())) {
        resolvedMediaType = resolvedMediaType ?? text.toLowerCase();
        // Fetch media details via message ID from Meta
        try {
          const { wa_access_token: token } = await getIntegrations();
          if (token && messageId) {
            const msgRes = await fetch(
              `https://graph.facebook.com/v22.0/${messageId}?fields=type,image,video,audio,sticker,document,voice`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            const msgJson = await msgRes.json() as Record<string, { id?: string; mime_type?: string } | string>;
            const mediaTypes = ["image", "video", "audio", "sticker", "document", "voice"] as const;
            for (const t of mediaTypes) {
              const obj = msgJson[t];
              if (obj && typeof obj === "object" && obj.id) {
                resolvedMediaUrl = `/api/bot/media/inbound?id=${obj.id}`;
                resolvedMediaType = t === "voice" ? "audio" : t;
                break;
              }
            }
          }
        } catch { /* don't fail the webhook if media resolution fails */ }
      }

      await prisma.message.create({
        data: {
          id:             crypto.randomUUID(),
          conversationId: conversation.id,
          waMessageId:    messageId,
          direction:      "INBOUND",
          body:           text ?? null,
          mediaUrl:       resolvedMediaUrl,
          mediaType:      resolvedMediaType,
          createdAt:      msgTime,
        },
      });
      pgNotify({ type: "message_new", conversationId: conversation.id, waId }).catch(() => {});
    }

    return jsonOk({ ok: true });
  } catch (err) {
    console.error("[inbox/webhook]", err);
    return jsonError("Internal server error", 500);
  }
}
