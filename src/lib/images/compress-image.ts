/**
 * Client-side image compression for upload.
 *
 * - Accepts JPEG, PNG, WebP.
 * - Downscales the longest edge to MAX_DIMENSION (1600 px).
 * - Re-encodes lossy at QUALITY (0.82) using `canvas.toBlob`.
 * - PNG inputs are re-encoded as WebP because PNG compression rarely
 *   helps for photos and WebP keeps transparency while being far smaller.
 *   JPEG and WebP inputs keep their original mime type.
 * - Skips compression entirely when the file is already small enough.
 * - Falls back to the original file if compression makes it larger.
 * - Throws a friendly error if the result is still over 5 MB.
 *
 * Runs entirely in the browser. No server-side dependency.
 */

const MAX_DIMENSION = 1600;
const QUALITY = 0.82;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const SKIP_COMPRESSION_THRESHOLD = 500 * 1024; // 500 KB

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export type CompressPhase = "decoding" | "resizing" | "encoding";

export type CompressOptions = {
  onPhase?: (phase: CompressPhase) => void;
};

export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Unsupported image type. Use JPG, PNG, or WebP.");
  }

  options.onPhase?.("decoding");
  const decoded = await decodeImage(file);
  const { width, height } = dimensions(decoded);
  const longest = Math.max(width, height);

  // Skip path — already small in both bytes and pixels.
  if (longest <= MAX_DIMENSION && file.size <= SKIP_COMPRESSION_THRESHOLD) {
    closeBitmap(decoded);
    return file;
  }

  options.onPhase?.("resizing");
  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    closeBitmap(decoded);
    throw new Error("Canvas is not supported in this browser.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(decoded, 0, 0, targetW, targetH);
  closeBitmap(decoded);

  options.onPhase?.("encoding");
  // PNG → WebP (rationale in file header). Otherwise keep type.
  const outputType = file.type === "image/png" ? "image/webp" : file.type;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outputType, QUALITY),
  );
  if (!blob) throw new Error("Failed to compress image.");

  // Safety net — if compression somehow produced a larger file, keep the original.
  if (blob.size >= file.size) return file;

  if (blob.size > MAX_OUTPUT_BYTES) {
    throw new Error(
      "Image is too large even after compression. Try a smaller image.",
    );
  }

  const ext =
    outputType === "image/webp"
      ? "webp"
      : outputType === "image/png"
        ? "png"
        : "jpg";
  const baseName =
    (file.name || "image").replace(/\.[^.]+$/, "") || "image";

  return new File([blob], `${baseName}.${ext}`, {
    type: outputType,
    lastModified: Date.now(),
  });
}

// --- helpers ---

async function decodeImage(
  file: File,
): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap is faster and avoids EXIF rotation surprises in
  // most modern browsers. Falls back to <img> for older Safari.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image file."));
    };
    img.src = url;
  });
}

function dimensions(b: ImageBitmap | HTMLImageElement): {
  width: number;
  height: number;
} {
  if ("naturalWidth" in b) {
    return { width: b.naturalWidth, height: b.naturalHeight };
  }
  return { width: b.width, height: b.height };
}

function closeBitmap(b: ImageBitmap | HTMLImageElement): void {
  if (typeof (b as ImageBitmap).close === "function") {
    (b as ImageBitmap).close();
  }
}
