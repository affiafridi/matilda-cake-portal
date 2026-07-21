import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IG_API = "https://graph.facebook.com/v20.0";

async function resolveIgName(psid: string, token: string): Promise<string | null> {
  const headers = { Authorization: `Bearer ${token}` };
  for (const fields of ["name,username", "name"]) {
    try {
      const res  = await fetch(`${IG_API}/${psid}?fields=${fields}`, { headers });
      const data = await res.json() as { name?: string; username?: string; error?: { message: string } };
      if (data.error) continue;
      if (data.username) return `@${data.username}`;
      if (data.name)     return data.name;
    } catch { continue; }
  }
  return null;
}

/** POST — re-resolve display names for all IG conversations that have placeholder names */
export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const { instagram_page_access_token } = await getIntegrations();
    if (!instagram_page_access_token) return jsonError("Instagram token not configured", 400);

    // Find conversations with generic placeholder names
    const convs = await prisma.conversation.findMany({
      where: {
        OR: [{ channel: "instagram" }, { waId: { startsWith: "ig_" } }],
        customerName: { startsWith: "IG " },
      },
      select: { id: true, waId: true, customerName: true },
    });

    let updated = 0;
    for (const c of convs) {
      const psid = c.waId.replace(/^ig_/, "");
      const name = await resolveIgName(psid, instagram_page_access_token);
      if (name && name !== c.customerName) {
        await prisma.conversation.update({ where: { id: c.id }, data: { customerName: name } });
        updated++;
      }
    }

    return jsonOk({ checked: convs.length, updated });
  } catch (err) {
    return handleApiError(err);
  }
}
