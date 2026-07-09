import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversations = await prisma.conversation.findMany({
    where: { status: "OPEN" },
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
