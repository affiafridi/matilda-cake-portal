import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";
import { pgNotify } from "@/lib/sse-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

/** POST /api/inbox/conversations/[id]/reply — send a WhatsApp message to the customer */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(ALLOWED);
    const { id } = await params;
    const body  = await req.json().catch(() => ({}));
    const text  = (body.text ?? "").trim();
    if (!text) return jsonError("Message text is required", 400);

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true, waId: true },
    });
    if (!conversation) return jsonError("Conversation not found", 404);

    // Send via WhatsApp Cloud API
    const { wa_phone_number_id: phoneNumberId, wa_access_token: accessToken } = await getIntegrations();
    if (!phoneNumberId || !accessToken) {
      return jsonError("WhatsApp credentials not configured", 500);
    }

    const waRes = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to:                conversation.waId,
          type:              "text",
          text:              { body: text },
        }),
      },
    );

    const waJson = await waRes.json().catch(() => ({})) as { messages?: { id: string }[] };
    const waMessageId = waJson.messages?.[0]?.id ?? null;

    // Save the outbound message to the portal DB
    const now = new Date();
    await prisma.$transaction([
      prisma.message.create({
        data: {
          id:             crypto.randomUUID(),
          conversationId: id,
          waMessageId,
          direction:      "OUTBOUND",
          messageStatus:  "SENT",
          body:           text,
          sentById:       actor.id,
          createdAt:      now,
        },
      }),
      prisma.conversation.update({
        where: { id },
        data:  {
          lastMessageAt:    now,
          lastMessageBody:  text,
          lastHumanReplyAt: now,
          botPaused:        true,
          status:           "OPEN",
        },
      }),
    ]);

    pgNotify({ type: "message_new", conversationId: id, waId: conversation.waId }).catch(() => {});
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
