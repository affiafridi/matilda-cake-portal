import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IG_API = "https://graph.facebook.com/v20.0";

/** POST /api/admin/fix-ig-names — re-fetch real usernames for IG conversations with generic names */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { instagram_page_access_token } = await getIntegrations();
  if (!instagram_page_access_token) {
    return NextResponse.json({ ok: false, error: "Instagram token not configured" }, { status: 400 });
  }

  // Find all Instagram conversations — either generic name OR channel=instagram
  const convs = await prisma.conversation.findMany({
    where: {
      OR: [
        { waId: { startsWith: "ig_" } },
        { channel: "instagram" },
      ],
    },
    select: { id: true, waId: true, customerName: true },
  });

  let updated = 0;
  const errors: string[] = [];

  const igHeaders = { Authorization: `Bearer ${instagram_page_access_token}` };

  for (const conv of convs) {
    const psid = conv.waId.replace(/^ig_/, "");
    try {
      let newName = "";

      for (const fields of ["name,username", "name"]) {
        const res  = await fetch(`${IG_API}/${psid}?fields=${fields}`, { headers: igHeaders });
        const data = await res.json() as { name?: string; username?: string; error?: { message: string; code?: number } };

        if (data.error) {
          errors.push(`${psid} (fields=${fields}): ${data.error.message}`);
          continue;
        }

        newName = data.username ? `@${data.username}` : (data.name ?? "");
        if (newName) break;
      }

      if (!newName || newName === conv.customerName) continue;

      await prisma.conversation.update({
        where: { id: conv.id },
        data: { customerName: newName },
      });
      updated++;
    } catch (e) {
      errors.push(`${psid}: ${String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, checked: convs.length, updated, errors });
}
