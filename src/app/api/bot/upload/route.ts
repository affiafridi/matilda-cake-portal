import type { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { randomUUID } from "crypto";
import { Storage } from "@google-cloud/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".pdf"]);
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4",
  ".pdf": "application/pdf",
};
const MAX_MB = 100;

let _storage: Storage | null = null;
function gcs() {
  if (!_storage) _storage = new Storage();
  return _storage;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") return jsonError("No file", 400);

    const f = file as File;
    const ext = extname(f.name).toLowerCase();
    if (!ALLOWED.has(ext)) return jsonError(`File type ${ext} not allowed`, 400);
    if (f.size > MAX_MB * 1024 * 1024) return jsonError(`File too large (max ${MAX_MB} MB)`, 400);

    const buffer = Buffer.from(await f.arrayBuffer());
    const filename = `${randomUUID()}${ext}`;
    const bucketName = process.env.GCS_ORDER_IMAGES_BUCKET;

    if (bucketName) {
      // Upload to GCS with public-read so Meta can fetch the URL
      const objectPath = `wa-media/${filename}`;
      const gcsFile = gcs().bucket(bucketName).file(objectPath);
      await gcsFile.save(buffer, {
        contentType: MIME[ext] ?? "application/octet-stream",
        resumable: false,
        metadata: { cacheControl: "public, max-age=31536000" },
      });
      // Make publicly accessible
      await gcsFile.makePublic();
      const url = `https://storage.googleapis.com/${bucketName}/${objectPath}`;
      return jsonOk({ url, filename });
    }

    // Local fallback for dev — files are served from /uploads/media/
    const uploadDir = join(process.cwd(), "public", "uploads", "media");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), buffer);

    const host = req.headers.get("host") ?? "localhost:3000";
    const proto = host.startsWith("localhost") ? "http" : "https";
    const url = `${proto}://${host}/uploads/media/${filename}`;

    return jsonOk({ url, filename });
  } catch (err) {
    return handleApiError(err);
  }
}
