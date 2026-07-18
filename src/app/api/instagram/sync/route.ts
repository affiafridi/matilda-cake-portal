import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IG_API = "https://graph.facebook.com/v20.0";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { instagram_page_access_token } = await getIntegrations();
    if (!instagram_page_access_token) {
      return NextResponse.json({ ok: false, error: "Instagram not configured" }, { status: 400 });
    }

    const igHeaders = {
      "Authorization": `Bearer ${instagram_page_access_token}`,
      "Content-Type": "application/json",
    };

    // Get the page's own IG user ID
    const meRes = await fetch(`${IG_API}/me?fields=id`, { headers: igHeaders });
    const meData = await meRes.json() as { id?: string; error?: { message: string } };
    if (!meRes.ok || meData.error) {
      return NextResponse.json({ ok: false, error: meData.error?.message ?? "Token invalid", tokenPrefix: instagram_page_access_token.slice(0, 10) }, { status: 400 });
    }

    // Fetch conversations from Instagram Graph API
    const convRes = await fetch(
      `${IG_API}/me/conversations?platform=instagram&fields=id,participants,messages{id,message,from,created_time}&limit=50`,
      { headers: igHeaders }
    );
    const convData = await convRes.json() as IgConversationsResponse;

    if (!convRes.ok || convData.error) {
      return NextResponse.json({ ok: false, error: convData.error?.message ?? "Failed to fetch conversations" }, { status: 400 });
    }
    const pageId = meData.id ?? "";

    let imported = 0;

    for (const igConv of convData.data ?? []) {
      // Find the customer participant (not the page itself)
      const customer = igConv.participants?.data?.find((p) => p.id !== pageId);
      if (!customer) continue;

      const waId = `ig_${customer.id}`;
      const customerName = customer.name || `IG User ${customer.id.slice(-6)}`;

      // Get all messages sorted oldest first
      const messages = [...(igConv.messages?.data ?? [])].reverse();
      if (messages.length === 0) continue;

      const lastMsg = igConv.messages?.data?.[0]; // most recent (API returns newest first)
      const lastText = lastMsg?.message ?? "(media)";
      const lastAt = lastMsg?.created_time ? new Date(lastMsg.created_time) : new Date();

      // Upsert conversation
      let conv = await prisma.conversation.findUnique({ where: { waId } });
      if (!conv) {
        conv = await prisma.conversation.create({
          data: {
            id:              crypto.randomUUID(),
            waId,
            customerName,
            channel:         "instagram",
            status:          "OPEN",
            lastMessageAt:   lastAt,
            lastMessageBody: lastText,
            lastInboundAt:   lastAt,
            unreadCount:     0,
          },
        });
        imported++;
      }

      // Import messages that don't already exist
      for (const msg of messages) {
        if (!msg.id) continue;
        const exists = await prisma.message.findFirst({ where: { waMessageId: msg.id } });
        if (exists) continue;

        const isFromPage = msg.from?.id === pageId;
        await prisma.message.create({
          data: {
            id:             crypto.randomUUID(),
            conversationId: conv.id,
            waMessageId:    msg.id,
            direction:      isFromPage ? "OUTBOUND" : "INBOUND",
            messageStatus:  isFromPage ? "SENT" : undefined,
            body:           msg.message || null,
            createdAt:      msg.created_time ? new Date(msg.created_time) : new Date(),
          },
        });
      }
    }

    return NextResponse.json({ ok: true, imported });
  } catch (e) {
    console.error("[ig-sync]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

type IgConversationsResponse = {
  data?: {
    id: string;
    participants?: { data: { id: string; name?: string }[] };
    messages?: { data: { id: string; message?: string; from?: { id: string; name?: string }; created_time?: string }[] };
  }[];
  error?: { message: string };
};
