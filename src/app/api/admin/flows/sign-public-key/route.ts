import type { NextRequest } from "next/server";
import { createPublicKey } from "crypto";
import { requireRole } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    await requireRole(["SUPER_ADMIN", "ADMIN"] as const);

    const integrations = await getIntegrations();

    if (!integrations.flows_private_key?.trim())
      return jsonError("RSA private key not configured. Add it in Integrations → WhatsApp → WhatsApp Flows.", 400);
    if (!integrations.wa_phone_number_id?.trim())
      return jsonError("Phone Number ID not configured in WhatsApp integration.", 400);
    if (!integrations.wa_access_token?.trim())
      return jsonError("WhatsApp access token not configured.", 400);

    // Derive public key from the stored private key
    let publicKeyPem: string;
    try {
      const pub = createPublicKey(integrations.flows_private_key.trim());
      publicKeyPem = pub.export({ type: "spki", format: "pem" }) as string;
    } catch {
      return jsonError("Invalid RSA private key — check the key pasted in WhatsApp Flows settings.", 400);
    }

    // Upload to WhatsApp Business Encryption API
    const phoneNumberId = integrations.wa_phone_number_id.trim();
    const accessToken   = integrations.wa_access_token.trim();

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/whatsapp_business_encryption`,
      {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ business_public_key: publicKeyPem }).toString(),
      }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      const msg = data.error?.message ?? `Meta API error (${res.status})`;
      return jsonError(msg, 400);
    }

    return jsonOk({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
