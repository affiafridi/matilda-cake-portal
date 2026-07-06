import type { NextRequest } from "next/server";
import { getFlowImageStream, isValidFlowImagePath } from "@/lib/storage/gcs";
import { jsonError } from "@/lib/api/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get("key") ?? "";

    if (!isValidFlowImagePath(key)) return jsonError("Invalid key", 400);

    const { stream, contentType } = await getFlowImageStream(key);

    // Stream GCS object to the client — bucket name never leaves the server
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    return new NextResponse(Buffer.concat(chunks), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[flow-image]", err);
    return jsonError("Image not found", 404);
  }
}
