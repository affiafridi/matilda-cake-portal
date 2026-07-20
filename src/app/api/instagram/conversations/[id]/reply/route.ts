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
    // Accept both channel="instagram" and legacy rows (channel=null) with an ig_ waId
    const isIg = conversation.channel === "instagram" || conversation.waId.startsWith("ig_");
    if (!isIg) return jsonError("Not an Instagram conversation", 400);

    // Backfill channel field if it was missing
    if (conversation.channel !== "instagram") {
      await prisma.conversation.update({ where: { id }, data: { channel: "instagram" } });
    }

    const { instagram_page_access_token } = await getIntegrations();
    if (!instagram_page_access_token) return jsonError("Instagram token not configured", 500);

    const igHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${instagram_page_access_token}` };

    // Get own IG user ID to use explicit endpoint instead of /me
    const meRes  = await fetch("https://graph.facebook.com/v20.0/me?fields=id", { headers: igHeaders });
    const meData = await meRes.json().catch(() => ({})) as { id?: string; error?: { message: string } };
    if (!meRes.ok || !meData.id) {
      return jsonError(meData.error?.message ?? "Invalid Instagram token", 502);
    }

    // waId is stored as "ig_<psid>" — extract the raw PSID for the recipient
    const recipientId = conversation.waId.replace(/^ig_/, "");

    const igRes = await fetch(`https://graph.facebook.com/v20.0/${meData.id}/messages`, {
      method:  "POST",
      headers: igHeaders,
      body: JSON.stringify({
        recipient: { id: recipientId },
        message:   { text },
      }),
    });

    const igJson = await igRes.json().catch(() => ({})) as { message_id?: string; error?: { message: string; code?: number } };
    if (!igRes.ok || igJson.error) {
      console.error("[ig-reply]", igJson.error);
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
