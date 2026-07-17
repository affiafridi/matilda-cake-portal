import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/track/wc-click?waId=971501234567&url=<encoded-wc-checkout-url>
 *
 * Records a CLICKED lead event then immediately redirects the customer to the
 * WooCommerce checkout URL. The customer sees a ~instant redirect with no
 * noticeable delay.
 *
 * The bot should send this URL instead of the raw WC checkout link:
 *   <portal-origin>/api/track/wc-click?waId={waId}&url={encodeURIComponent(wcCheckoutUrl)}
 *
 * The portal origin is dynamic — no hardcoded domain. When the portal moves
 * from staging to portal.matildacake.com the bot only needs to update its
 * base URL; this code stays unchanged.
 *
 * Security: the redirect target is validated against the configured wc_url so
 * this endpoint cannot be used as an open redirector.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const waId = searchParams.get("waId") ?? "";
  const url  = searchParams.get("url")  ?? "";

  // Validate redirect target — must start with the configured WC store URL
  const { wc_url } = await getIntegrations();

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Only allow http/https URLs that start with the configured wc_url.
  // If wc_url is not configured yet, block to prevent open-redirect abuse.
  const normalizedUrl   = wc_url.replace(/\/$/, "");
  const normalizedDest  = url.startsWith("http") ? url : "";
  const isAllowed       = normalizedUrl && normalizedDest.startsWith(normalizedUrl);

  if (!isAllowed) {
    console.warn("[wc-click] Blocked redirect to", url, "— wc_url:", wc_url);
    return NextResponse.json({ error: "Invalid redirect destination" }, { status: 400 });
  }

  // Fire-and-forget: track CLICKED stage without blocking the redirect
  if (waId) {
    const cleanWaId = waId.replace(/^\+/, "");
    prisma.whatsappLead
      .findFirst({
        where:   { waId: cleanWaId, stage: { notIn: ["PAID", "ABANDONED"] } },
        orderBy: { createdAt: "desc" },
      })
      .then(async (existing) => {
        if (existing) {
          await prisma.whatsappLead.update({
            where: { id: existing.id },
            data:  { stage: "CLICKED", updatedAt: new Date() },
          });
        } else {
          await prisma.whatsappLead.create({
            data: {
              id:           crypto.randomUUID(),
              waId:         cleanWaId,
              customerName: cleanWaId,
              phone:        cleanWaId,
              orderDetails: "",
              source:       "woocommerce",
              stage:        "CLICKED",
              status:       "NEW",
            },
          });
        }
      })
      .catch(() => {});
  }

  // Redirect customer to WC checkout — 302 so browsers don't cache it
  return NextResponse.redirect(url, 302);
}
