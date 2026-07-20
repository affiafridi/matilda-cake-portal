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

    // entry.id is the IG Business Account ID — store it so we can use it for sends
    const igBusinessId = entries[0]?.id;
    if (igBusinessId) {
      prisma.$executeRaw`INSERT INTO portal_settings (key, value) VALUES ('ig_business_id', ${igBusinessId}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
        .catch(() => {});
    }

    for (const entry of entries) {
      for (const event of entry.messaging ?? []) {
        const senderId = event.sender?.id;
        const msg      = event.message;

        // Skip echoes (messages sent by the page itself) and non-message events
        if (!senderId || !msg || msg.is_echo) continue;

        const text        = msg.text ?? null;
        const attachments = msg.attachments ?? [];

        if (!text && attachments.length === 0) continue;

        // Classify: is this a story mention or a real DM?
        const isStoryMention = attachments.length > 0 && attachments.every((a) => a.type === "story_mention");
        const previewBody    = isStoryMention
          ? "📖 Mentioned you in a story"
          : text ?? "(media)";

        const waId = `ig_${senderId}`;
        const now  = new Date();

        let conversation = await prisma.conversation.findUnique({ where: { waId } });
        if (!conversation) {
          const customerName = await resolveIgName(senderId);
          conversation = await prisma.conversation.create({
            data: {
              id:              crypto.randomUUID(),
              waId,
              customerName,
              channel:         "instagram",
              status:          "OPEN",
              lastMessageAt:   now,
              lastMessageBody: previewBody,
              lastInboundAt:   now,
              unreadCount:     1,
            },
          });
        } else {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessageAt:   now,
              lastMessageBody: previewBody,
              lastInboundAt:   now,
              unreadCount:     { increment: 1 },
              status:          "OPEN",
              // Backfill channel for conversations created before the field existed
              ...(conversation.channel !== "instagram" ? { channel: "instagram" } : {}),
            },
          });
        }

        // Store text as one message
        if (text) {
          await prisma.message.create({
            data: {
              id:             crypto.randomUUID(),
              conversationId: conversation.id,
              waMessageId:    msg.mid ?? null,
              direction:      "INBOUND",
              body:           text,
              createdAt:      now,
            },
          });
        }

        // Store each attachment as a separate message so all images show
        for (let i = 0; i < attachments.length; i++) {
          const att = attachments[i];
          await prisma.message.create({
            data: {
              id:             crypto.randomUUID(),
              conversationId: conversation.id,
              waMessageId:    msg.mid ? `${msg.mid}_att${i}` : null,
              direction:      "INBOUND",
              body:           att.type === "story_mention" ? "Mentioned you in their story" : null,
              mediaUrl:       att.payload?.url ?? null,
              mediaType:      att.type ?? "image",
              createdAt:      new Date(now.getTime() + i + 1),
            },
          });
        }

        // Auto-reply via AI (non-blocking — don't let it delay the 200 response)
        // Skip story mentions — they're not messages the user typed, no reply makes sense
        if (text && !isStoryMention && !conversation.botPaused) {
          // Check global Instagram bot toggle
          prisma.$queryRaw<{ value: string }[]>`SELECT value FROM portal_settings WHERE key = 'instagram_bot_enabled' LIMIT 1`
            .then((rows) => {
              const enabled = (rows[0]?.value ?? "true") !== "false";
              if (enabled) triggerAiReply(conversation!.id, waId, senderId, text).catch(() => {});
            }).catch(() => triggerAiReply(conversation!.id, waId, senderId, text).catch(() => {}));
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
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };

  // Use the stored IG Business Account ID (captured from webhook entry.id on first inbound message)
  // Fallback to /me if not stored yet
  const rows = await prisma.$queryRaw<{ value: string }[]>`SELECT value FROM portal_settings WHERE key = 'ig_business_id' LIMIT 1`.catch(() => []);
  let igId = rows[0]?.value;
  if (!igId) {
    const meRes  = await fetch(`${IG_API}/me?fields=id`, { headers });
    const meData = await meRes.json().catch(() => ({})) as { id?: string };
    igId = meData.id ?? "me";
  }

  return fetch(`${IG_API}/${igId}/messages`, {
    method:  "POST",
    headers,
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
    const headers = { Authorization: `Bearer ${instagram_page_access_token}` };

    // Try name+username first; fall back to name-only if that fails (IG User tokens
    // may not expose username for other users)
    for (const fields of ["name,username", "name"]) {
      const res  = await fetch(`${IG_API}/${psid}?fields=${fields}`, { headers });
      const data = await res.json() as { name?: string; username?: string; error?: { message: string; code?: number } };
      if (data.error) {
        console.warn(`[ig-webhook] resolveIgName ${psid} (fields=${fields}):`, data.error.message);
        continue;
      }
      const name = data.username ? `@${data.username}` : data.name;
      if (name) return name;
    }
    return `IG ${psid.slice(-6)}`;
  } catch (e) {
    console.warn("[ig-webhook] resolveIgName error:", e);
    return `IG User ${psid.slice(-6)}`;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────
type IgMessage = {
  mid?: string;
  text?: string;
  is_echo?: boolean;
  attachments?: { type: string; payload: { url: string } }[];
  // Instagram sends each image as a separate message event, but sometimes batches them
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
