import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IG_API = "https://graph.facebook.com/v20.0";

export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const { instagram_page_access_token } = await getIntegrations();
    if (!instagram_page_access_token) return jsonError("Instagram token not configured", 400);

    const headers = {
      Authorization: `Bearer ${instagram_page_access_token}`,
      "Content-Type": "application/json",
    };
    const tokenPrefix = instagram_page_access_token.slice(0, 12) + "…";

    // Stored ig_business_id
    const rows = await prisma.$queryRaw<{ value: string }[]>`SELECT value FROM portal_settings WHERE key = 'ig_business_id' LIMIT 1`.catch(() => []);
    const storedBusinessId = rows[0]?.value ?? null;

    // /me — token identity
    const meRes  = await fetch(`${IG_API}/me?fields=id,name`, { headers });
    const meData = await meRes.json() as Record<string, unknown>;

    // Token debug — scopes
    const debugRes  = await fetch(`${IG_API}/debug_token?input_token=${instagram_page_access_token}&access_token=${instagram_page_access_token}`, { headers });
    const debugData = await debugRes.json() as Record<string, unknown>;

    // If /me returned a page/user ID, check what it looks like
    let entityData: Record<string, unknown> | null = null;
    const meId = meData.id as string | undefined;
    if (meId) {
      const r = await fetch(`${IG_API}/${meId}?fields=id,name,instagram_business_account`, { headers });
      entityData = await r.json() as Record<string, unknown>;
    }

    // Check what stored id looks like
    let storedEntityData: Record<string, unknown> | null = null;
    if (storedBusinessId && storedBusinessId !== meId) {
      const r = await fetch(`${IG_API}/${storedBusinessId}?fields=id,name,instagram_business_account`, { headers });
      storedEntityData = await r.json() as Record<string, unknown>;
    }

    // Count IG conversations
    const igConvCount = await prisma.conversation.count({ where: { OR: [{ channel: "instagram" }, { waId: { startsWith: "ig_" } }] } });

    return jsonOk({
      tokenPrefix,
      storedBusinessId,
      me: meData,
      entityCheck: entityData,
      storedEntityCheck: storedEntityData,
      tokenDebug: debugData,
      igConversationCount: igConvCount,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
