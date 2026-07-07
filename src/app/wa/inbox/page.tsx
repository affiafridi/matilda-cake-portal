import { getCurrentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [conversations, agents, templateRow] = await Promise.all([
    prisma.conversation.findMany({
      where:   { status: "OPEN", OR: [{ botPaused: true }, { agentRequested: true }] },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      select: {
        id: true, waId: true, customerName: true, status: true,
        botPaused: true, agentRequested: true, tags: true, lastInboundAt: true,
        unreadCount: true, lastMessageAt: true, lastMessageBody: true,
        assignedTo: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where:   { isActive: true, role: { in: ["SUPER_ADMIN", "ADMIN", "AGENT"] } },
      select:  { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.$queryRaw<{ value: string }[]>`
      SELECT value FROM portal_settings WHERE key = 'inbox_template_name' LIMIT 1
    `,
  ]);

  const templateConfigured = !!(templateRow[0]?.value?.trim());

  const serialized = conversations.map((c) => ({
    ...c,
    lastMessageAt:  c.lastMessageAt.toISOString(),
    lastInboundAt:  c.lastInboundAt?.toISOString() ?? null,
  }));

  return <InboxClient initialConversations={serialized} agents={agents} currentUserId={user.id} templateConfigured={templateConfigured} />;
}
