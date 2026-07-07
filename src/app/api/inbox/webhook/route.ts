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

      await prisma.message.updateMany({
        where: { waMessageId },
        data:  { messageStatus: mapped },
      });

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

    const customer = await prisma.customer.findFirst({
      where: { OR: [{ whatsappNumber: waId }, { phone: waId }] },
      select: { id: true },
    });

    const conversation = await prisma.conversation.upsert({
      where:  { waId },
      create: {
        id:              crypto.randomUUID(),
        waId,
        customerName:    name || waId,
        customerId:      customer?.id ?? null,
        lastMessageAt:   msgTime,
        lastInboundAt:   msgTime,
        lastMessageBody: text ?? mediaType ?? null,
        unreadCount:     1,
      },
      update: {
        customerName:    name || waId,
        customerId:      customer?.id ?? null,
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
