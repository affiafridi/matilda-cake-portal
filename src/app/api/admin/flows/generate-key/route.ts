import type { NextRequest } from "next/server";
import { generateKeyPairSync, createPublicKey } from "crypto";
import { requireRole } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    await requireRole(["SUPER_ADMIN", "ADMIN"] as const);

    const integrations = await getIntegrations();

    if (!integrations.wa_phone_number_id?.trim())
      return jsonError("Phone Number ID not configured in WhatsApp integration.", 400);
    if (!integrations.wa_access_token?.trim())
      return jsonError("WhatsApp access token not configured.", 400);

    // Generate 2048-bit RSA key pair
    const { privateKey: privKeyObj } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privKeyObj.export({ type: "pkcs8",  format: "pem" }) as string;
    const publicKeyPem  = createPublicKey(privKeyObj).export({ type: "spki", format: "pem" }) as string;

    // Save private key to DB
    await prisma.$executeRaw`
      INSERT INTO portal_settings (key, value) VALUES ('flows_private_key', ${privateKeyPem})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;

    // Upload public key to Meta
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${integrations.wa_phone_number_id.trim()}/whatsapp_business_encryption`,
      {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${integrations.wa_access_token.trim()}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ business_public_key: publicKeyPem }).toString(),
      }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      return jsonError(data.error?.message ?? `Meta API error (${res.status})`, 400);
    }

    return jsonOk({ privateKey: privateKeyPem });
  } catch (err) {
    return handleApiError(err);
  }
}
