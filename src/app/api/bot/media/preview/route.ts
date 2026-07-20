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
    // Meta returns handles in multiple formats: "h:xxx", "2:xxx", "4:xxx" etc.
    // Only reject clearly invalid values; the handle is always encodeURIComponent'd before being
    // used in the Meta API URL so path-traversal is not a concern.
    if (!handle || handle.length > 2048 || handle.includes("..") || handle.startsWith("http")) {
      return jsonError("Invalid handle", 400);
    }

    // Fetch signed URL from Meta
    const metaRes = await fetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(handle)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const metaJson = await metaRes.json();
    if (metaJson.error || !metaJson.url) return jsonError(metaJson.error?.message ?? "Media not found", 404);

    // Forward Range header if present (required for video playback/seeking)
    const rangeHeader = req.headers.get("range");
    const fetchHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

    const fileRes = await fetch(metaJson.url as string, { headers: fetchHeaders });
    if (!fileRes.ok && fileRes.status !== 206) return jsonError("Failed to fetch media from Meta", 502);

    const buffer = await fileRes.arrayBuffer();
    const contentType = fileRes.headers.get("content-type") ?? "application/octet-stream";
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
