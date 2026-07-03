import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const businessId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!businessId || !token) return jsonError("WhatsApp not configured", 500);

    const all = req.nextUrl.searchParams.get("all") === "1";

    const res = await fetch(
      `https://graph.facebook.com/v20.0/${businessId}/message_templates?fields=name,status,language,category,components{type,format,text,example,buttons{type,text,url,phone_number}}&limit=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = await res.json();
    if (json.error) return jsonError(json.error.message, 400);

    const data = all
      ? (json.data ?? [])
      : (json.data ?? []).filter((t: { status: string }) => t.status === "APPROVED");

    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}
