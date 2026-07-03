import { getCurrentUser } from "@/lib/auth/server";
import { jsonOk } from "@/lib/api/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  return jsonOk({ id: user.id, name: user.name, role: user.role });
}
