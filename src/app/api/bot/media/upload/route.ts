import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "application/pdf": "pdf",
};
const MAX_MB = 100;

async function creds() {
  const { wa_phone_number_id: phoneId, wa_access_token: token } = await getIntegrations();
  if (!phoneId || !token) throw new Error("WhatsApp not configured");
  return { phoneId, token };
}

/**
 * Upload a file to Meta's Resumable Upload API.
 * Returns a permanent handle (h:xxxx) that can be used in:
 *   - Template creation: example.header_handle
 *   - Campaign sends: header parameter link
 *
 * Meta's resumable upload is 2 steps:
 *   1. POST /app/uploads → get upload session id
 *   2. POST /{session_id} with file bytes → get handle
 */
async function uploadToMeta(buffer: Buffer, mimeType: string, filename: string, token: string): Promise<string> {
  // Step 1 — create upload session
  const sessionRes = await fetch(
    `https://graph.facebook.com/v22.0/app/uploads?file_length=${buffer.byteLength}&file_type=${encodeURIComponent(mimeType)}&file_name=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const sessionJson = await sessionRes.json();
  if (sessionJson.error) throw new Error(`Meta upload session: ${sessionJson.error.message}`);
  const sessionId: string = sessionJson.id; // e.g. "upload:abc123"

  // Step 2 — upload file bytes
  const uploadRes = await fetch(
    `https://graph.facebook.com/v22.0/${sessionId}`,
    {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: "0",
        "Content-Type": mimeType,
      },
      body: new Uint8Array(buffer),
    },
  );
  const uploadJson = await uploadRes.json();
  if (uploadJson.error) throw new Error(`Meta file upload: ${uploadJson.error.message}`);
  if (!uploadJson.h || typeof uploadJson.h !== "string") throw new Error("Meta did not return an upload handle");

  return uploadJson.h as string;
}

/**
 * GET preview URL for a Meta media handle.
 * Returns a signed CDN URL valid for ~1 hour.
 */
async function getPreviewUrl(handle: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v22.0/${encodeURIComponent(handle)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = await res.json();
    if (!json.url || typeof json.url !== "string") return null;
    return json.url as string;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const { token } = await creds();

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") return jsonError("No file provided", 400);

    const f = file as File;
    const mimeType = f.type || "image/jpeg";
    if (!ALLOWED_MIME[mimeType]) return jsonError(`File type not supported: ${mimeType}`, 400);
    if (f.size > MAX_MB * 1024 * 1024) return jsonError(`File too large (max ${MAX_MB} MB)`, 400);

    const buffer = Buffer.from(await f.arrayBuffer());
    const filename = f.name || `upload.${ALLOWED_MIME[mimeType]}`;

    // Upload to Meta — get permanent handle
    const handle = await uploadToMeta(buffer, mimeType, filename, token);

    // Fetch a signed preview URL so the dashboard can render it
    const previewUrl = await getPreviewUrl(handle, token);

    return jsonOk({ handle, previewUrl, mimeType, filename });
  } catch (err) {
    return handleApiError(err);
  }
}
