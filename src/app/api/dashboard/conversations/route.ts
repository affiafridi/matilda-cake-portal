import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const where: Prisma.ConversationWhereInput = user.role === "SUPER_ADMIN"
    ? { status: "OPEN" }
    : { status: "OPEN", NOT: { channel: "instagram" } };

  const conversations = await prisma.conversation.findMany({
    where,
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
