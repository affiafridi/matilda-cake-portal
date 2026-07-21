import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN"] as const;

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

    // Use the stored IG Business Account ID (captured from webhook entry.id on first inbound message)
    const settingRows = await prisma.$queryRaw<{ value: string }[]>`SELECT value FROM portal_settings WHERE key = 'ig_business_id' LIMIT 1`.catch(() => []);
    let igSenderId = settingRows[0]?.value;
    if (!igSenderId) {
      // Fallback: derive from /me (works for IG User tokens but may return FB User ID)
      const meRes  = await fetch("https://graph.facebook.com/v20.0/me?fields=id", { headers: igHeaders });
      const meData = await meRes.json().catch(() => ({})) as { id?: string; error?: { message: string } };
      if (!meRes.ok || !meData.id) {
        return jsonError(meData.error?.message ?? "Invalid Instagram token — and ig_business_id not yet stored. Send a test DM to the Instagram account first to initialise it.", 502);
      }
      igSenderId = meData.id;
    }

    // waId is stored as "ig_<psid>" — extract the raw PSID for the recipient
    const recipientId = conversation.waId.replace(/^ig_/, "");

    // Try Messenger Platform format first (messaging_type=RESPONSE required for 24h window)
    let igRes = await fetch(`https://graph.facebook.com/v20.0/${igSenderId}/messages`, {
      method:  "POST",
      headers: igHeaders,
      body: JSON.stringify({
        recipient:      { id: recipientId },
        messaging_type: "RESPONSE",
        message:        { text },
      }),
    });

    let igJson = await igRes.json().catch(() => ({})) as { message_id?: string; error?: { message: string; code?: number } };

    // Fallback: try /me/messages if the stored sender ID failed
    if ((!igRes.ok || igJson.error) && igSenderId !== "me") {
      console.warn("[ig-reply] primary sender failed, trying /me:", igJson.error?.message);
      igRes = await fetch(`https://graph.facebook.com/v20.0/me/messages`, {
        method:  "POST",
        headers: igHeaders,
        body: JSON.stringify({
          recipient:      { id: recipientId },
          messaging_type: "RESPONSE",
          message:        { text },
        }),
      });
      igJson = await igRes.json().catch(() => ({})) as { message_id?: string; error?: { message: string; code?: number } };
    }

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
