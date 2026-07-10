import { NextRequest, NextResponse } from "next/server";
import { getIntegrations } from "@/lib/integrations";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_FIELDS = "about,address,description,email,profile_picture_url,websites,vertical";
const GQL = "https://graph.facebook.com/v20.0";

export async function GET() {
  const { wa_phone_number_id: id, wa_access_token: token } = await getIntegrations();
  if (!id || !token) return NextResponse.json({ ok: false, error: "WA not configured" }, { status: 503 });

  try {
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "";

    const [phoneRes, profileRes, wabaRes] = await Promise.all([
      fetch(`${GQL}/${id}?fields=verified_name,name,display_phone_number,phone_number,code_verification_status,quality_rating,messaging_limit_tier,status,account_mode,throughput,username&access_token=${token}`, { cache: "no-store" }),
      fetch(`${GQL}/${id}/whatsapp_business_profile?fields=${PROFILE_FIELDS}&access_token=${token}`, { cache: "no-store" }),
      wabaId
        ? fetch(`${GQL}/${wabaId}?fields=is_official_business_account,name,phone_numbers{verified_name,display_phone_number}&access_token=${token}`, { cache: "no-store" })
        : Promise.resolve(null),
    ]);

    const phone   = await phoneRes.json();
    const profile = await profileRes.json();
    const waba    = wabaRes ? await wabaRes.json() : {};
    const p       = profile?.data?.[0] ?? {};

    // Surface Meta API errors to aid debugging
    if (phone.error)   console.error("[wa/profile phone]", JSON.stringify(phone.error));
    if (profile.error) console.error("[wa/profile profile]", JSON.stringify(profile.error));
    if (waba?.error)   console.error("[wa/profile waba]", JSON.stringify(waba.error));
    // Debug: log what Meta returned for name/phone fields
    console.log("[wa/profile] phone fields:", JSON.stringify({
      verified_name: phone.verified_name, name: phone.name,
      display_phone_number: phone.display_phone_number, phone_number: phone.phone_number,
      status: phone.status, account_mode: phone.account_mode,
    }));

    // verified_name is the primary; some accounts return it as "name" instead
    const verifiedName = phone.verified_name
      || phone.name
      || waba?.phone_numbers?.data?.[0]?.verified_name
      || waba?.name
      || "";
    // display_phone_number; some API versions return it as "phone_number"
    const displayPhone = phone.display_phone_number
      || phone.phone_number
      || waba?.phone_numbers?.data?.[0]?.display_phone_number
      || "";

    return NextResponse.json({
      ok: true,
      data: {
        verified_name:                verifiedName,
        display_phone_number:         displayPhone,
        username:                     phone.username                         ?? null,
        quality_rating:               phone.quality_rating                   ?? null,
        messaging_limit_tier:         phone.messaging_limit_tier             ?? null,
        status:                       phone.status ?? phone.account_mode     ?? null,
        throughput:                   phone.throughput?.level                ?? null,
        is_official_business_account: waba.is_official_business_account      ?? false,
        profile_picture_url:  p.profile_picture_url ?? null,
        about:       p.about       ?? "",
        description: p.description ?? "",
        address:     p.address     ?? "",
        email:       p.email       ?? "",
        websites:    p.websites    ?? [],
        vertical:    p.vertical    ?? "",
      },
    });
  } catch (e) {
    console.error("[wa/profile GET]", e);
    return NextResponse.json({ ok: false, error: "Meta API error" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { wa_phone_number_id: id, wa_access_token: token } = await getIntegrations();
  if (!id || !token) return NextResponse.json({ ok: false, error: "WA not configured" }, { status: 503 });

  const body = await req.json();

  // Username is updated on the phone number endpoint, not the profile endpoint
  if (body.username !== undefined) {
    try {
      const res = await fetch(`${GQL}/${id}?access_token=${token}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: body.username }),
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ ok: false, error: data?.error?.message ?? "Username update failed" }, { status: 502 });
      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error("[wa/profile username POST]", e);
      return NextResponse.json({ ok: false, error: "Meta API error" }, { status: 502 });
    }
  }

  // Profile fields go to whatsapp_business_profile
  const payload: Record<string, unknown> = {};
  if (body.about       !== undefined) payload.about       = body.about;
  if (body.description !== undefined) payload.description = body.description;
  if (body.address     !== undefined) payload.address     = body.address;
  if (body.email       !== undefined) payload.email       = body.email;
  if (body.websites    !== undefined) payload.websites    = body.websites;
  if (body.vertical    !== undefined) payload.vertical    = body.vertical;

  try {
    const res = await fetch(`${GQL}/${id}/whatsapp_business_profile?access_token=${token}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, error: data?.error?.message ?? "Meta error" }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[wa/profile POST]", e);
    return NextResponse.json({ ok: false, error: "Meta API error" }, { status: 502 });
  }
}
