import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value FROM portal_settings
      WHERE key IN ('woo_visible_to_admin', 'ai_visible_to_admin', 'app_name', 'primary_color', 'logo_url')
    `;

    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return jsonOk({
      woo_visible_to_admin: (map["woo_visible_to_admin"] ?? "false") === "true",
      ai_visible_to_admin:  (map["ai_visible_to_admin"]  ?? "false") === "true",
      app_name:      map["app_name"]      ?? "Order Portal",
      primary_color: map["primary_color"] ?? "#6b2e1a",
      logo_url:      map["logo_url"]      ?? "/uploads/logo.png",
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const body = await req.json() as { key: string; value: boolean | string };
    const allowed = ["woo_visible_to_admin", "ai_visible_to_admin", "app_name", "primary_color", "logo_url"];
    if (!allowed.includes(body.key)) return jsonError("Invalid key", 400);

    const strVal = String(body.value);
    await prisma.$executeRaw`
      INSERT INTO portal_settings (key, value) VALUES (${body.key}, ${strVal})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;

    return jsonOk({ [body.key]: body.value });
  } catch (err) {
    return handleApiError(err);
  }
}
