import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IG_API = "https://graph.facebook.com/v20.0";

// ── GET — Meta webhook verification challenge ──────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const { instagram_verify_token } = await getIntegrations();
  const verifyToken = instagram_verify_token || "matilda_ig_verify";

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
}

// ── POST — Receive Instagram DMs ───────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as IgWebhookPayload;

    // Instagram sends entry[] with messaging[] arrays
    const entries = body.entry ?? [];

    for (const entry of entries) {
      for (const event of entry.messaging ?? []) {
        const senderId = event.sender?.id;
        const msg      = event.message;

        // Skip echoes (messages sent by the page itself) and non-message events
        if (!senderId || !msg || msg.is_echo) continue;

        const text      = msg.text ?? null;
        const mediaUrl  = extractMediaUrl(msg);
        const mediaType = extractMediaType(msg);

        if (!text && !mediaUrl) continue;

        // Instagram conversations use "ig_<psid>" as waId to avoid conflicts with WA phone numbers
        const waId = `ig_${senderId}`;

        // Upsert conversation
        const now = new Date();
        let conversation = await prisma.conversation.findUnique({ where: { waId } });

        if (!conversation) {
          // Resolve display name — IG API can return it but requires an extra call; use PSID for now
          const customerName = await resolveIgName(senderId);
          conversation = await prisma.conversation.create({
            data: {
              id:           crypto.randomUUID(),
              waId,
              customerName,
              channel:      "instagram",
              status:       "OPEN",
              lastMessageAt: now,
              lastMessageBody: text ?? "(media)",
              lastInboundAt: now,
              unreadCount:  1,
            },
          });
        } else {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessageAt:  now,
              lastMessageBody: text ?? "(media)",
              lastInboundAt:  now,
              unreadCount:    { increment: 1 },
              status:         "OPEN",
            },
          });
        }

        // Store message
        await prisma.message.create({
          data: {
            id:             crypto.randomUUID(),
            conversationId: conversation.id,
            waMessageId:    msg.mid ?? null,
            direction:      "INBOUND",
            body:           text,
            mediaUrl,
            mediaType,
            createdAt:      now,
          },
        });

        // Auto-reply via AI (non-blocking — don't let it delay the 200 response)
        if (text && !conversation.botPaused) {
          triggerAiReply(conversation.id, waId, senderId, text).catch(() => {});
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ig-webhook]", e);
    // Always return 200 so Meta doesn't retry indefinitely
    return NextResponse.json({ ok: true });
  }
}

// ── AI auto-reply ──────────────────────────────────────────────────────────
async function triggerAiReply(
  conversationId: string,
  waId: string,
  igSenderId: string,
  message: string,
) {
  const { instagram_page_access_token, inbox_webhook_secret } = await getIntegrations();
  if (!instagram_page_access_token || !inbox_webhook_secret) return;

  const base = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const aiRes = await fetch(`${base}/api/bot/ai-reply`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-inbox-secret": inbox_webhook_secret },
    body:    JSON.stringify({ message, waId }),
  });

  if (!aiRes.ok) return;
  const ai = await aiRes.json() as AiReply;

  let replyText: string | null = null;

  if (ai.type === "text" && ai.reply) {
    replyText = ai.reply;
  } else if (ai.type === "catalog") {
    replyText = "Here are our available products! You can browse them and let us know what you'd like. 🎂";
  } else if (ai.type === "product_search") {
    replyText = `Let me find that for you! We have a great selection of ${ai.query ?? "products"}. Please share more details about what you need. 🎂`;
  } else if (ai.type === "agent") {
    replyText = "I'll connect you with one of our team members right away! Please hold on for a moment. 😊";
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { agentRequested: true, botPaused: true },
    });
  } else if (ai.type === "order") {
    replyText = "Great! To place an order, please tell us:\n• What type of cake/product?\n• Occasion & date needed?\n• Delivery or pickup?\n\nOur team will get back to you shortly! 🎂";
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { agentRequested: true, botPaused: true },
    });
  }

  if (!replyText) return;

  // Send reply via Instagram Graph API
  await sendIgMessage(igSenderId, replyText, instagram_page_access_token);

  // Save outbound message
  const now = new Date();
  await prisma.$transaction([
    prisma.message.create({
      data: {
        id:             crypto.randomUUID(),
        conversationId,
        direction:      "OUTBOUND",
        messageStatus:  "SENT",
        body:           replyText,
        createdAt:      now,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now, lastMessageBody: replyText, lastHumanReplyAt: now },
    }),
  ]);
}

// ── Send Instagram message ─────────────────────────────────────────────────
async function sendIgMessage(recipientId: string, text: string, accessToken: string) {
  return fetch(`${IG_API}/me/messages`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body:    JSON.stringify({
      recipient: { id: recipientId },
      message:   { text },
    }),
  });
}

// ── Resolve IG display name ────────────────────────────────────────────────
async function resolveIgName(psid: string): Promise<string> {
  try {
    const { instagram_page_access_token } = await getIntegrations();
    if (!instagram_page_access_token) return `IG User ${psid.slice(-6)}`;
    const res = await fetch(
      `${IG_API}/${psid}?fields=name&access_token=${instagram_page_access_token}`,
    );
    const data = await res.json() as { name?: string };
    return data.name || `IG User ${psid.slice(-6)}`;
  } catch {
    return `IG User ${psid.slice(-6)}`;
  }
}

// ── Media helpers ──────────────────────────────────────────────────────────
function extractMediaUrl(msg: IgMessage): string | null {
  return msg.attachments?.[0]?.payload?.url ?? null;
}

function extractMediaType(msg: IgMessage): string | null {
  const type = msg.attachments?.[0]?.type;
  if (!type) return null;
  if (type === "image")  return "image/jpeg";
  if (type === "audio")  return "audio/ogg";
  if (type === "video")  return "video/mp4";
  return type;
}

// ── Types ──────────────────────────────────────────────────────────────────
type IgMessage = {
  mid?: string;
  text?: string;
  is_echo?: boolean;
  attachments?: { type: string; payload: { url: string } }[];
};

type IgWebhookPayload = {
  entry?: {
    id: string;
    messaging?: {
      sender:  { id: string };
      recipient: { id: string };
      message?: IgMessage;
    }[];
  }[];
};

type AiReply =
  | { type: "text";           reply?: string }
  | { type: "catalog" }
  | { type: "product_search"; query?: string }
  | { type: "agent" }
  | { type: "order" };
