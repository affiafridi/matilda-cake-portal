import type { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { Storage } from "@google-cloud/storage";
import { getCurrentUser } from "@/lib/auth/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg":  "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const GCS_OBJECT = "brand/logo";
const LOCAL_DIR  = path.join(process.cwd(), "public", "uploads", "brand");
const LOCAL_FILE = path.join(LOCAL_DIR, "logo");

let storageClient: Storage | null = null;
function getStorage() {
  return (storageClient ??= new Storage());
}

// ── POST — upload a new logo ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || typeof file.arrayBuffer !== "function") return jsonError("No file provided", 400);

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) return jsonError("Unsupported file type. Use JPG, PNG, WebP, or SVG.", 400);
    if (file.size > MAX_BYTES) return jsonError("File too large. Max 2 MB.", 413);

    const buffer = Buffer.from(await file.arrayBuffer());
    const bucketName = process.env.GCS_ORDER_IMAGES_BUCKET;

    if (bucketName) {
      const objectPath = `${GCS_OBJECT}.${ext}`;
      const gcsFile = getStorage().bucket(bucketName).file(objectPath);
      await gcsFile.save(buffer, {
        contentType: file.type,
        resumable:   false,
        metadata: { cacheControl: "public, max-age=86400" },
      });
      // Make it publicly readable so it works as an <img src> anywhere
      await gcsFile.makePublic().catch(() => {
        // Uniform bucket-level access — can't set ACL, serve through proxy instead
      });
    } else {
      // Local dev: write to public/uploads/brand/logo.<ext>
      await fs.mkdir(LOCAL_DIR, { recursive: true });
      await fs.writeFile(`${LOCAL_FILE}.${ext}`, buffer);
    }

    // Save stable proxy URL to portal_settings
    const logoUrl = "/api/admin/logo";
    await prisma.$executeRaw`
      INSERT INTO portal_settings (key, value) VALUES ('logo_url', ${logoUrl})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;

    return jsonOk({ logo_url: logoUrl });
  } catch (err) {
    return handleApiError(err);
  }
}

// ── DELETE — remove the logo ──────────────────────────────────────────────

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const bucketName = process.env.GCS_ORDER_IMAGES_BUCKET;

    if (bucketName) {
      for (const ext of ["png", "jpg", "webp", "svg"]) {
        try {
          const gcsFile = getStorage().bucket(bucketName).file(`${GCS_OBJECT}.${ext}`);
          const [exists] = await gcsFile.exists();
          if (exists) await gcsFile.delete();
        } catch { continue; }
      }
    } else {
      for (const ext of ["png", "jpg", "webp", "svg"]) {
        try { await fs.unlink(`${LOCAL_FILE}.${ext}`); } catch { continue; }
      }
    }

    // Clear logo_url
    await prisma.$executeRaw`
      INSERT INTO portal_settings (key, value) VALUES ('logo_url', '')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;

    return jsonOk({ logo_url: "" });
  } catch (err) {
    return handleApiError(err);
  }
}

// ── GET — serve the logo (stable proxy URL) ───────────────────────────────

export async function GET() {
  try {
    const bucketName = process.env.GCS_ORDER_IMAGES_BUCKET;

    if (bucketName) {
      // Try to find the logo on GCS (check common extensions)
      for (const ext of ["png", "jpg", "webp", "svg"]) {
        try {
          const gcsFile = getStorage().bucket(bucketName).file(`${GCS_OBJECT}.${ext}`);
          const [exists] = await gcsFile.exists();
          if (!exists) continue;

          // Try public URL first (works if makePublic() succeeded)
          const publicUrl = `https://storage.googleapis.com/${bucketName}/${GCS_OBJECT}.${ext}`;
          // Redirect to public URL — zero latency proxy
          return Response.redirect(publicUrl, 302);
        } catch {
          continue;
        }
      }
    }

    // Local fallback
    for (const ext of ["png", "jpg", "webp", "svg"]) {
      try {
        const buf = await fs.readFile(`${LOCAL_FILE}.${ext}`);
        const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
        return new Response(buf, { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=86400" } });
      } catch {
        continue;
      }
    }

    // Nothing found — return 404
    return new Response("Logo not found", { status: 404 });
  } catch (err) {
    console.error("[logo] serve failed:", err);
    return new Response("Error serving logo", { status: 500 });
  }
}
