import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/fix-ig-channel — backfill channel="instagram" for ig_ conversations */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const result = await prisma.$executeRaw`
    UPDATE conversations
    SET channel = 'instagram'
    WHERE "waId" LIKE 'ig_%'
      AND (channel IS NULL OR channel != 'instagram')
  `;

  return NextResponse.json({ ok: true, updated: Number(result) });
}
