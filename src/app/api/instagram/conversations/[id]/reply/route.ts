import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IG_API = "https://graph.facebook.com/v21.0";
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
    const isIg = conversation.channel === "instagram" || conversation.waId.startsWith("ig_");
    if (!isIg) return jsonError("Not an Instagram conversation", 400);

    if (conversation.channel !== "instagram") {
      await prisma.conversation.update({ where: { id }, data: { channel: "instagram" } });
    }

    const { instagram_page_access_token } = await getIntegrations();
    if (!instagram_page_access_token) return jsonError("Instagram token not configured", 500);

    const igHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${instagram_page_access_token}` };

    // Get the Instagram Business Account ID.
    // For Instagram API (without Facebook Login), /me returns the IG User ID directly.
    // We prefer /me over the stored value since the stored value may be a Facebook Page ID
    // from a previously different webhook setup.
    const meRes  = await fetch(`${IG_API}/me?fields=id`, { headers: igHeaders });
    const meData = await meRes.json().catch(() => ({})) as { id?: string; error?: { message: string } };

    // Also check what was stored from the webhook entry.id (may differ)
    const settingRows = await prisma.$queryRaw<{ value: string }[]>`SELECT value FROM portal_settings WHERE key = 'ig_business_id' LIMIT 1`.catch(() => []);
    const storedId = settingRows[0]?.value;

    // Prefer /me result (most reliable for Instagram API without Facebook Login)
    const igSenderId = meData.id ?? storedId;
    if (!igSenderId) {
      return jsonError(
        meData.error?.message ?? "Could not resolve Instagram sender ID. Make sure your access token is valid.",
        502,
      );
    }

    // waId is stored as "ig_<igsid>" — extract the raw Instagram-Scoped User ID
    const recipientId = conversation.waId.replace(/^ig_/, "");

    // Instagram API (without Facebook Login) send format — no messaging_type field
    const igRes  = await fetch(`${IG_API}/${igSenderId}/messages`, {
      method:  "POST",
      headers: igHeaders,
      body:    JSON.stringify({
        recipient: { id: recipientId },
        message:   { text },
      }),
    });

    const igJson = await igRes.json().catch(() => ({})) as { message_id?: string; error?: { message: string; code?: number; error_subcode?: number } };

    if (!igRes.ok || igJson.error) {
      console.error("[ig-reply]", igJson.error);
      // Provide actionable error messages for common Meta error codes
      const code = igJson.error?.code;
      const msg  = igJson.error?.message ?? "Instagram API error";
      if (code === 3) {
        return jsonError(
          `Meta error #3: Your app doesn't have the instagram_business_manage_messages capability. Go to Meta App Dashboard → Your App → Instagram → Permissions and Features → enable instagram_business_manage_messages, then regenerate your access token.`,
          502,
        );
      }
      if (code === 10 || code === 200) {
        return jsonError(`Meta permission error: ${msg}. Your token may be missing the instagram_business_manage_messages scope. Regenerate the token.`, 502);
      }
      if (code === 190) {
        return jsonError("Instagram token expired or invalid. Please generate a new long-lived token in Meta App Dashboard.", 502);
      }
      return jsonError(msg, 502);
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
