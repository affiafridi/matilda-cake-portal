import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";
import { appendCustomerRow, isSheetsConfigured } from "@/lib/googlesheets";

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
          if (!recipient.status.includes("DELIVERED") && prev !== "READ") {
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

      return jsonOk({ ok: true });
    }

    // ── Outbound bot message ───────────────────────────────────────────────
    if (body.type === "outbound") {
      const { waId, messageId, body: text, mediaUrl, mediaType, metadata, timestamp } = body as {
        waId:      string;
        messageId: string;
        body:      string | null;
        mediaUrl:  string | null;
        mediaType: string | null;
        metadata:  unknown;
        timestamp: number;
      };
      if (!waId) return jsonError("waId is required", 400);
      const msgTime = timestamp ? new Date(timestamp * 1000) : new Date();

      const conv = await prisma.conversation.findUnique({ where: { waId }, select: { id: true } });
      if (!conv) return jsonOk({ skipped: true }); // no conversation yet

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
          where: { waId },
          data:  { lastMessageAt: msgTime, lastMessageBody: text ?? mediaType ?? "Bot message" },
        });
      }
      return jsonOk({ ok: true });
    }

    // ── Inbound message ────────────────────────────────────────────────────
    const { waId, name, messageId, body: text, mediaUrl, mediaType, timestamp } = body as {
      waId:      string;
      name:      string;
      messageId: string;
      body:      string | null;
      mediaUrl:  string | null;
      mediaType: string | null;
      timestamp: number;
    };

    if (!waId || !messageId) return jsonError("waId and messageId are required", 400);

    const msgTime = timestamp ? new Date(timestamp * 1000) : new Date();

    // Upsert customer — creates on first message, updates name if it changed
    const customer = await prisma.customer.upsert({
      where:  { phone: waId },
      create: { id: crypto.randomUUID(), name: name || waId, phone: waId, whatsappNumber: waId },
      update: { name: name || waId, whatsappNumber: waId },
      select: { id: true },
    });

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
        unreadCount:     1,
      },
      update: {
        customerName:    name || waId,
        customerId:      customer.id,
        lastMessageAt:   msgTime,
        lastInboundAt:   msgTime,
        lastMessageBody: text ?? mediaType ?? null,
        unreadCount:     { increment: 1 },
        status:          "OPEN",
      },
    });

    // Auto-sync new contacts to Google Sheets (fire-and-forget, never blocks the webhook)
    if ((await isSheetsConfigured()) && conversation.unreadCount === 1) {
      appendCustomerRow({ phone: waId, name: name || waId, firstSeen: msgTime }).catch(() => {});
    }

    const existing = await prisma.message.findUnique({
      where:  { waMessageId: messageId },
      select: { id: true },
    });

    if (!existing) {
      await prisma.message.create({
        data: {
          id:             crypto.randomUUID(),
          conversationId: conversation.id,
          waMessageId:    messageId,
          direction:      "INBOUND",
          body:           text ?? null,
          mediaUrl:       mediaUrl ?? null,
          mediaType:      mediaType ?? null,
          createdAt:      msgTime,
        },
      });
    }

    return jsonOk({ ok: true });
  } catch (err) {
    console.error("[inbox/webhook]", err);
    return jsonError("Internal server error", 500);
  }
}
