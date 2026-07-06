import type { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/auth/server";
import { uploadFlowImage } from "@/lib/storage/gcs";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_MB = 5;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") return jsonError("No file provided", 400);

    const f = file as File;
    const ext = ALLOWED_MIME[f.type];
    if (!ext) return jsonError("File type not allowed. Use JPEG, PNG or WebP.", 400);
    if (f.size > MAX_MB * 1024 * 1024) return jsonError(`File too large (max ${MAX_MB} MB)`, 400);

    const id = randomBytes(8).toString("hex");
    const filename = `${Date.now()}-${id}.${ext}`;
    const buffer = Buffer.from(await f.arrayBuffer());

    const bucketName = process.env.GCS_ORDER_IMAGES_BUCKET;

    if (bucketName) {
      // GCS path — file stored privately, served through our proxy route
      try {
        const objectPath = await uploadFlowImage({ buffer, contentType: f.type, filename });
        const url = `/api/bot/media/flow-image?key=${encodeURIComponent(objectPath)}`;
        return jsonOk({ url }, 201);
      } catch (err) {
        console.error("[flow-upload] GCS failed:", err);
        // In development fall back to local storage so dev works without GCS credentials
        if (process.env.NODE_ENV !== "production") {
          console.warn("[flow-upload] falling back to local storage in dev mode");
        } else {
          return jsonError("Image upload failed. Please try again.", 502);
        }
      }
    }

    // Local fallback — writes to /public/uploads/flow-images/ when GCS not configured or dev fallback
    try {
      const uploadDir = path.join(process.cwd(), "public", "uploads", "flow-images");
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(path.join(uploadDir, filename), buffer);
    } catch (err) {
      console.error("[flow-upload] local write failed:", err);
      return jsonError("Upload storage not available. Set GCS_ORDER_IMAGES_BUCKET to enable cloud uploads.", 500);
    }

    return jsonOk({ url: `/uploads/flow-images/${filename}` }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
