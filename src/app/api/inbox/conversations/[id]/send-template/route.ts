import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED       = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;
const TEMPLATE_LANG = "en";

/**
 * POST /api/inbox/conversations/[id]/send-template
 * Sends the approved WhatsApp re-engagement template.
 * Used when the 24h messaging window is closed.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(ALLOWED);
    const { id } = await params;

    const { wa_phone_number_id: phoneNumberId, wa_access_token: accessToken } = await getIntegrations();
    if (!phoneNumberId || !accessToken) return jsonError("WhatsApp credentials not configured", 500);

    const templateRow = await prisma.$queryRaw<{ value: string }[]>`
      SELECT value FROM portal_settings WHERE key = 'inbox_template_name' LIMIT 1
    `;
    const TEMPLATE_NAME = templateRow[0]?.value || "conversation_followup";

    const conversation = await prisma.conversation.findUnique({
      where:  { id },
      select: { id: true, waId: true, customerName: true },
    });
    if (!conversation) return jsonError("Conversation not found", 404);

    // Use first name only for a natural greeting
    const firstName = conversation.customerName.split(" ")[0] || conversation.customerName;

    const waRes = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to:                conversation.waId,
          type:              "template",
          template: {
            name:     TEMPLATE_NAME,
            language: { code: TEMPLATE_LANG },
            components: [
              {
                type:       "body",
                parameters: [{ type: "text", text: firstName }],
              },
            ],
          },
        }),
      },
    );

    const waJson = await waRes.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message: string } };

    if (!waJson.messages?.[0]?.id) {
      return jsonError(waJson.error?.message ?? "Failed to send template", 502);
    }

    const waMessageId = waJson.messages[0].id;
    const now         = new Date();
    const body        = `Hi ${firstName}, we noticed your conversation with us was paused. We're here if you need any help — just reply to this message.`;

    await prisma.$transaction([
      prisma.message.create({
        data: {
          id:             crypto.randomUUID(),
          conversationId: id,
          waMessageId,
          direction:      "OUTBOUND",
          messageStatus:  "SENT",
          body,
          sentById:       actor.id,
          createdAt:      now,
        },
      }),
      prisma.conversation.update({
        where: { id },
        data:  {
          lastMessageAt:    now,
          lastMessageBody:  body,
          lastHumanReplyAt: now,
          lastInboundAt:    now,  // re-opens the 24h window
          botPaused:        true,
          status:           "OPEN",
        },
      }),
    ]);

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
