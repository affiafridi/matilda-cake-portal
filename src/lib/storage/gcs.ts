import "server-only";
import { Storage } from "@google-cloud/storage";

/**
 * Server-only Google Cloud Storage helpers.
 *
 * Authentication uses Application Default Credentials — no JSON key
 * files. On Cloud Run the runtime service account is picked up from the
 * metadata server. Locally, run `gcloud auth application-default login`.
 *
 * The bucket name is read from `GCS_ORDER_IMAGES_BUCKET`. The bucket
 * must remain private — we never make objects public.
 */

let storageClient: Storage | null = null;
function getStorage(): Storage {
  if (!storageClient) storageClient = new Storage();
  return storageClient;
}

/** Returns the configured GCS bucket name, or undefined when unset. */
export function getBucketName(): string | undefined {
  return process.env.GCS_ORDER_IMAGES_BUCKET;
}

/**
 * Uploads a custom-cake reference image and returns the object path
 * (e.g. `custom-cakes/2026/05/<filename>.webp`) — never a URL. Callers
 * persist the path; signed URLs are generated on demand for viewing.
 */
export async function uploadOrderImage(args: {
  buffer: Buffer;
  contentType: string;
  filename: string;
}): Promise<string> {
  const bucketName = getBucketName();
  if (!bucketName) throw new Error("GCS_ORDER_IMAGES_BUCKET is not set");

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const objectPath = `custom-cakes/${yyyy}/${mm}/${args.filename}`;

  const file = getStorage().bucket(bucketName).file(objectPath);
  await file.save(args.buffer, {
    contentType: args.contentType,
    resumable: false,
    metadata: {
      cacheControl: "private, max-age=86400",
    },
  });

  return objectPath;
}

/**
 * Generates a short-lived v4 signed URL for reading an existing object.
 * Default TTL is the value passed in by the caller — the API layer caps
 * this to a sensible window (15 minutes for the public-facing endpoint).
 */
export async function getSignedReadUrl(
  objectPath: string,
  ttlMs: number,
): Promise<string> {
  const bucketName = getBucketName();
  if (!bucketName) throw new Error("GCS_ORDER_IMAGES_BUCKET is not set");

  const [url] = await getStorage()
    .bucket(bucketName)
    .file(objectPath)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + ttlMs,
    });
  return url;
}

/**
 * Uploads a flow card image and returns the GCS object path
 * (e.g. `flow-images/2026/07/<uuid>.jpg`). Files stay private in GCS;
 * serve them through /api/bot/media/flow-image.
 */
export async function uploadFlowImage(args: {
  buffer: Buffer;
  contentType: string;
  filename: string;
}): Promise<string> {
  const bucketName = getBucketName();
  if (!bucketName) throw new Error("GCS_ORDER_IMAGES_BUCKET is not set");

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const objectPath = `flow-images/${yyyy}/${mm}/${args.filename}`;

  const file = getStorage().bucket(bucketName).file(objectPath);
  await file.save(args.buffer, {
    contentType: args.contentType,
    resumable: false,
    metadata: { cacheControl: "private, max-age=86400" },
  });

  return objectPath;
}

/**
 * Streams a flow image object from GCS. Used by the public serve route
 * so the GCS bucket name is never exposed in URLs.
 */
export async function getFlowImageStream(objectPath: string): Promise<{
  stream: NodeJS.ReadableStream;
  contentType: string;
}> {
  const bucketName = getBucketName();
  if (!bucketName) throw new Error("GCS_ORDER_IMAGES_BUCKET is not set");

  const file = getStorage().bucket(bucketName).file(objectPath);
  const [metadata] = await file.getMetadata();
  const contentType = (metadata.contentType as string) || "image/jpeg";
  const stream = file.createReadStream();
  return { stream, contentType };
}

/**
 * Validates that an object path is a safe flow-images path.
 */
export function isValidFlowImagePath(p: string): boolean {
  if (!p || typeof p !== "string") return false;
  if (p.length > 1024) return false;
  if (p.includes("..") || p.includes("\0")) return false;
  if (p.startsWith("/")) return false;
  if (!p.startsWith("flow-images/")) return false;
  return p.length > "flow-images/".length;
}

/**
 * Strict allow-list for object paths the signed-URL API will resolve.
 * Restricts to the upload prefix and rejects path traversal / absolute
 * paths / null-byte tricks. Length capped at 1 KB (object names are
 * 1024 bytes max in GCS anyway).
 */
export function isValidOrderImagePath(p: string): boolean {
  if (!p || typeof p !== "string") return false;
  if (p.length > 1024) return false;
  if (p.includes("..") || p.includes("\0")) return false;
  if (p.startsWith("/")) return false;
  if (!p.startsWith("custom-cakes/")) return false;
  // Require at least one character after the prefix.
  return p.length > "custom-cakes/".length;
}
