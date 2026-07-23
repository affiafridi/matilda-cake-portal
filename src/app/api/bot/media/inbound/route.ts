import type { NextRequest } from "next/server";
import { jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy inbound customer media from Meta by media ID.
 * Meta's signed CDN URLs expire quickly — the bot stores the media ID,
 * and we resolve + stream it on demand so the inbox always shows the image/file.
 *
 * GET /api/bot/media/inbound?id=<meta_media_id>
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const { wa_access_token: token } = await getIntegrations();
    if (!token) return jsonError("WhatsApp not configured", 500);

    const mediaId = req.nextUrl.searchParams.get("id");
    if (!mediaId || !/^\d+$/.test(mediaId)) return jsonError("Invalid media ID", 400);

    // Step 1 — resolve media ID to a signed CDN URL
    const metaRes = await fetch(
      `https://graph.facebook.com/v22.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const metaJson = await metaRes.json() as { url?: string; mime_type?: string; error?: { message: string } };
    if (metaJson.error || !metaJson.url) {
      return jsonError(metaJson.error?.message ?? "Media not found", 404);
    }

    // Step 2 — stream the file, forwarding Range header for video seeking
    const rangeHeader = req.headers.get("range");
    const fetchHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

    const fileRes = await fetch(metaJson.url, { headers: fetchHeaders });
    if (!fileRes.ok && fileRes.status !== 206) return jsonError("Failed to fetch media", 502);

    const buffer = await fileRes.arrayBuffer();
    const contentType = metaJson.mime_type ?? fileRes.headers.get("content-type") ?? "application/octet-stream";
    const contentRange = fileRes.headers.get("content-range");

    const resHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    };
    if (contentRange) resHeaders["Content-Range"] = contentRange;
    if (fileRes.headers.get("content-length")) resHeaders["Content-Length"] = fileRes.headers.get("content-length")!;

    return new Response(buffer, {
      status: fileRes.status === 206 ? 206 : 200,
      headers: resHeaders,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
