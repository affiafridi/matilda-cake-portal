import { NextRequest, NextResponse } from "next/server";
import { getIntegrations } from "@/lib/integrations";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GQL    = "https://graph.facebook.com/v20.0";
const APP_ID = process.env.WHATSAPP_APP_ID ?? "";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  if (!APP_ID) return NextResponse.json({ ok: false, error: "WHATSAPP_APP_ID not configured" }, { status: 503 });

  const { wa_phone_number_id: id, wa_access_token: token } = await getIntegrations();
  if (!id || !token) return NextResponse.json({ ok: false, error: "WA not configured" }, { status: 503 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });

  const bytes  = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const mime   = file.type || "image/jpeg";

  try {
    // Step 1 — create upload session
    const sessionRes = await fetch(
      `${GQL}/${APP_ID}/uploads?file_length=${buffer.byteLength}&file_type=${encodeURIComponent(mime)}&access_token=${token}`,
      { method: "POST" }
    );
    const session = await sessionRes.json();
    if (!sessionRes.ok || !session.id) {
      return NextResponse.json({ ok: false, error: session?.error?.message ?? "Upload session failed" }, { status: 502 });
    }

    // Step 2 — upload file binary
    const uploadRes = await fetch(`${GQL}/${session.id}`, {
      method:  "POST",
      headers: {
        Authorization:   `OAuth ${token}`,
        file_offset:     "0",
        "Content-Type":  mime,
      },
      body: buffer,
    });
    const upload = await uploadRes.json();
    if (!uploadRes.ok || !upload.h) {
      return NextResponse.json({ ok: false, error: upload?.error?.message ?? "Upload failed" }, { status: 502 });
    }

    // Step 3 — set profile picture handle
    const profileRes = await fetch(`${GQL}/${id}/whatsapp_business_profile?access_token=${token}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: upload.h }),
    });
    const profile = await profileRes.json();
    if (!profileRes.ok) {
      return NextResponse.json({ ok: false, error: profile?.error?.message ?? "Profile update failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[wa/profile-picture POST]", e);
    return NextResponse.json({ ok: false, error: "Upload error" }, { status: 502 });
  }
}
