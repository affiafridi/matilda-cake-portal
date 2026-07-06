import { NextResponse } from "next/server";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { wa_phone_number_id: phoneNumberId, wa_access_token: token } = await getIntegrations();

  if (!phoneNumberId || !token) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  try {
    // Fetch verified name from phone number endpoint
    const phoneRes = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}?fields=verified_name&access_token=${token}`,
      { next: { revalidate: 3600 } }
    );
    const phoneData = await phoneRes.json();

    // Fetch profile picture from whatsapp_business_profile
    const profileRes = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/whatsapp_business_profile?fields=profile_picture_url&access_token=${token}`,
      { next: { revalidate: 3600 } }
    );
    const profileData = await profileRes.json();
    const picture = profileData?.data?.[0]?.profile_picture_url ?? null;

    return NextResponse.json({
      ok: true,
      name: phoneData.verified_name ?? "",
      picture,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
