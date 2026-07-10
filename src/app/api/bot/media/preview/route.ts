import type { NextRequest } from "next/server";
import { jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy a Meta media handle preview through our server.
 * Meta's signed CDN URLs require auth headers — browsers can't fetch them directly.
 *
 * GET /api/bot/media/preview?handle=h:xxxx
 */
export async function GET(req: NextRequest) {
  try {
    const { wa_access_token: token } = await getIntegrations();
    if (!token) return jsonError("WhatsApp not configured", 500);

    const handle = req.nextUrl.searchParams.get("handle");
    // Meta returns handles in multiple formats: "h:xxx" (resumable upload) or "4:xxx" / "3:xxx" (template API)
    if (!handle || handle.length > 1024 || !/^[A-Za-z0-9][A-Za-z0-9+/=_\-:]*$/.test(handle)) {
      return jsonError("Invalid handle", 400);
    }

    // Fetch signed URL from Meta
    const metaRes = await fetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(handle)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const metaJson = await metaRes.json();
    if (metaJson.error || !metaJson.url) return jsonError(metaJson.error?.message ?? "Media not found", 404);

    // Proxy the actual file
    const fileRes = await fetch(metaJson.url as string, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fileRes.ok) return jsonError("Failed to fetch media from Meta", 502);

    const buffer = await fileRes.arrayBuffer();
    const contentType = fileRes.headers.get("content-type") ?? "image/jpeg";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
