import type { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { Storage } from "@google-cloud/storage";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";

/**
 * POST /api/uploads/order-item-reference
 *
 * Persists a single image (multipart/form-data, field name: `file`) and
 * returns the URL + metadata so the form can save them on the OrderItem.
 *
 * STORAGE STRATEGY
 * ----------------
 * - When `GCS_ORDER_IMAGES_BUCKET` is set, the file is uploaded to Google
 *   Cloud Storage under `custom-cakes/YYYY/MM/<filename>`. The bucket
 *   stays private; we return a v4 signed URL (7-day max expiry).
 *
 *   Authentication uses Application Default Credentials — no JSON key
 *   files. On Cloud Run the runtime service account is picked up from
 *   the metadata server. For local dev, run
 *   `gcloud auth application-default login` once.
 *
 * - When the env var is NOT set, the file is written to
 *   `public/uploads/order-items/` and a relative URL is returned.
 *   This keeps local development frictionless if GCS isn't configured
 *   yet, but it never runs in production because Cloud Run's filesystem
 *   is read-only.
 *
 * TODO(refresh): v4 signed URLs cap at 7 days. For long-term reference
 * (e.g. an order opened by an operator weeks later), add a proxy route that
 * re-signs on demand using the stored object path. Out of scope here.
 */

export const runtime = "nodejs"; // requires fs + GCS SDK

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (v4 max)

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// ---------- GCS client (lazy singleton) ----------

let storageClient: Storage | null = null;
function getStorage(): Storage {
  if (!storageClient) {
    // No keyFilename / credentials passed in — Storage falls back to
    // Application Default Credentials. Never reads JSON service-account
    // files explicitly.
    storageClient = new Storage();
  }
  return storageClient;
}

async function uploadToGcs(args: {
  bucketName: string;
  buffer: Buffer;
  contentType: string;
  filename: string;
}): Promise<{ url: string; objectPath: string }> {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const objectPath = `custom-cakes/${yyyy}/${mm}/${args.filename}`;

  const file = getStorage().bucket(args.bucketName).file(objectPath);

  await file.save(args.buffer, {
    contentType: args.contentType,
    resumable: false, // small file, single-request PUT
    metadata: {
      cacheControl: "private, max-age=86400",
    },
  });

  // Bucket is private — return a v4 signed URL the browser can fetch.
  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + SIGNED_URL_TTL_MS,
  });

  return { url: signedUrl, objectPath };
}

// ---------- Handler ----------

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("No file provided", 400);
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return jsonError(
        "Unsupported file type. Use JPG, PNG, or WebP.",
        400,
      );
    }

    if (file.size > MAX_BYTES) {
      return jsonError("File too large. Max 5 MB.", 413);
    }

    // Safe, opaque, collision-resistant filename. Excludes any user input
    // so a malicious filename can't traverse paths or inject characters.
    const id = randomBytes(8).toString("hex");
    const filename = `${Date.now()}-${id}.${ext}`;
    const safeName = (file.name || filename).slice(0, 200);
    const buffer = Buffer.from(await file.arrayBuffer());

    const bucketName = process.env.GCS_ORDER_IMAGES_BUCKET;

    if (bucketName) {
      // Production / GCS path
      try {
        const { url } = await uploadToGcs({
          bucketName,
          buffer,
          contentType: file.type,
          filename,
        });
        return jsonOk(
          {
            referenceImageUrl: url,
            referenceImageName: safeName,
            referenceImageType: file.type,
          },
          201,
        );
      } catch (err) {
        console.error("[upload] GCS upload failed:", err);
        return jsonError(
          "Image upload failed. Please try again or contact support.",
          502,
        );
      }
    }

    // Dev-only fallback: write to public/ when GCS isn't configured.
    try {
      const uploadDir = path.join(
        process.cwd(),
        "public",
        "uploads",
        "order-items",
      );
      await fs.mkdir(uploadDir, { recursive: true });
      const filepath = path.join(uploadDir, filename);
      await fs.writeFile(filepath, buffer);
    } catch (err) {
      console.error("[upload] local write failed:", err);
      return jsonError(
        "Upload storage is not available. Set GCS_ORDER_IMAGES_BUCKET to enable cloud uploads.",
        500,
      );
    }

    return jsonOk(
      {
        referenceImageUrl: `/uploads/order-items/${filename}`,
        referenceImageName: safeName,
        referenceImageType: file.type,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
