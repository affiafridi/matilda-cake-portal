import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getOAuthClient, saveGoogleTokens } from "@/lib/googlesheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const code  = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  const redirectBase = process.env.NEXT_PUBLIC_APP_URL ?? "";

  if (error || !code) {
    return NextResponse.redirect(`${redirectBase}/admin/integrations?google=error`);
  }

  try {
    const oauth = await getOAuthClient();
    const { tokens } = await oauth.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(`${redirectBase}/admin/integrations?google=error`);
    }

    await saveGoogleTokens({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date:   tokens.expiry_date ?? Date.now() + 3600000,
    });

    // Fetch and store the connected account email so the UI can show it
    try {
      const oauth = await getOAuthClient();
      oauth.setCredentials({ access_token: tokens.access_token });
      const people = await fetch("https://www.googleapis.com/oauth2/v2/userinfo?fields=email", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const info = await people.json() as { email?: string };
      if (info.email) {
        const { prisma } = await import("@/lib/prisma");
        await prisma.$executeRaw`
          INSERT INTO portal_settings (key, value) VALUES ('google_account_email', ${info.email})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `;
      }
    } catch { /* non-fatal — just won't show the email */ }

    return NextResponse.redirect(`${redirectBase}/admin/integrations?google=connected`);
  } catch (err) {
    console.error("[google/callback]", err);
    return NextResponse.redirect(`${redirectBase}/admin/integrations?google=error`);
  }
}
