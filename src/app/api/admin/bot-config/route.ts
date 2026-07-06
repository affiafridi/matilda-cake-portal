import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function botFetch(path: string, options?: RequestInit) {
  const { bot_url, inbox_webhook_secret } = await getIntegrations();
  if (!bot_url) throw new Error("BOT_URL not configured");
  return fetch(`${bot_url}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-inbox-secret": inbox_webhook_secret,
      ...(options?.headers ?? {}),
    },
  });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const res  = await botFetch("/api/config");
    const raw  = await res.json();

    // Normalize snake_case bot response → camelCase for portal UI
    const data = {
      shop: {
        phone:        raw.shop?.phone         ?? "",
        email:        raw.shop?.email         ?? "",
        website:      raw.shop?.website       ?? "",
        welcomeImage: raw.shop?.welcome_image ?? "",
        teamNumbers:  raw.shop?.team_numbers  ?? "",
      },
      keywords: (raw.keywords ?? []) as { id: number; word: string; type: string }[],
      replies: (raw.replies ?? []).map((r: { id: number; key: string; body_en: string; body_ar?: string }) => ({
        id:    r.id,
        key:   r.key,
        bodyEn: r.body_en  ?? "",
        bodyAr: r.body_ar  ?? "",
      })),
    };

    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const body = await req.json();
    const res  = await botFetch("/api/config", { method: "POST", body: JSON.stringify(body) });
    const data = await res.json();
    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}
