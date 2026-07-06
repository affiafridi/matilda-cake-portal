import { requireUser } from "@/lib/auth/server";
import { jsonOk, jsonError } from "@/lib/api/http";
import { AuthError } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";

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

    const integ = await getIntegrations();
    return jsonOk({
      isSuperAdmin,
      credentials: [
        { label: "Phone Number ID",     value: mask(integ.wa_phone_number_id,     6) },
        { label: "Business Account ID", value: mask(integ.wa_business_account_id, 6) },
        { label: "Access Token",        value: mask(integ.wa_access_token,         6) },
      ],
    });
  } catch (e) {
    if (e instanceof AuthError) return jsonError("Unauthorized", 401);
    return jsonError("Server error", 500);
  }
}
