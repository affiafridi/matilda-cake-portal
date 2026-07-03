import { requireUser } from "@/lib/auth/server";
import { jsonOk, jsonError } from "@/lib/api/http";
import { AuthError } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mask(value: string | undefined, showChars = 6): string {
  if (!value) return "— not set —";
  if (value.length <= showChars) return "•".repeat(value.length);
  return "•".repeat(value.length - showChars) + value.slice(-showChars);
}

export async function GET() {
  try {
    const user = await requireUser();
    const isSuperAdmin = user.role === "SUPER_ADMIN";

    return jsonOk({
      isSuperAdmin,
      credentials: [
        { label: "Phone Number ID",       env: "WHATSAPP_PHONE_NUMBER_ID",       value: mask(process.env.WHATSAPP_PHONE_NUMBER_ID, 6) },
        { label: "Business Account ID",   env: "WHATSAPP_BUSINESS_ACCOUNT_ID",   value: mask(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID, 6) },
        { label: "Access Token",          env: "WHATSAPP_ACCESS_TOKEN",           value: mask(process.env.WHATSAPP_ACCESS_TOKEN, 6) },
      ],
    });
  } catch (e) {
    if (e instanceof AuthError) return jsonError("Unauthorized", 401);
    return jsonError("Server error", 500);
  }
}
