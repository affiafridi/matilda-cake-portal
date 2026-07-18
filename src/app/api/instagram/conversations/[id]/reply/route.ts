import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

/** POST /api/instagram/conversations/[id]/reply — agent sends a DM reply */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(ALLOWED);
    const { id } = await params;
    const body  = await req.json().catch(() => ({}));
    const text  = (body.text ?? "").trim();
    if (!text) return jsonError("Message text is required", 400);

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true, waId: true, channel: true },
    });
    if (!conversation) return jsonError("Conversation not found", 404);
    if (conversation.channel !== "instagram") return jsonError("Not an Instagram conversation", 400);

    const { instagram_page_access_token } = await getIntegrations();
    if (!instagram_page_access_token) return jsonError("Instagram token not configured", 500);

    // waId is stored as "ig_<psid>" — extract the raw PSID for the API call
    const igUserId = conversation.waId.replace(/^ig_/, "");

    const igRes = await fetch("https://graph.facebook.com/v20.0/me/messages", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${instagram_page_access_token}`,
      },
      body: JSON.stringify({
        recipient: { id: igUserId },
        message:   { text },
      }),
    });

    const igJson = await igRes.json().catch(() => ({})) as { message_id?: string; error?: { message: string } };
    if (!igRes.ok) {
      return jsonError(igJson.error?.message ?? "Instagram API error", 502);
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.message.create({
        data: {
          id:             crypto.randomUUID(),
          conversationId: id,
          waMessageId:    igJson.message_id ?? null,
          direction:      "OUTBOUND",
          messageStatus:  "SENT",
          body:           text,
          sentById:       actor.id,
          createdAt:      now,
        },
      }),
      prisma.conversation.update({
        where: { id },
        data: {
          lastMessageAt:    now,
          lastMessageBody:  text,
          lastHumanReplyAt: now,
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
