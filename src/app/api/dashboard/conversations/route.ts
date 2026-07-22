import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Non-SUPER_ADMIN roles don't have access to Instagram — exclude those conversations
  const channelFilter = user.role === "SUPER_ADMIN" ? {} : { NOT: { channel: "instagram" } };

  const conversations = await prisma.conversation.findMany({
    where: { status: "OPEN", ...channelFilter },
    orderBy: { lastMessageAt: "desc" },
    take: 6,
    select: {
      id: true,
      customerName: true,
      lastMessageBody: true,
      lastMessageAt: true,
      unreadCount: true,
    },
  });

  return NextResponse.json(conversations);
}
