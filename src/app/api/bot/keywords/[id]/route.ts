import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Unauthorized", 401);

    const { id } = await params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return jsonError("Invalid id", 400);

    const { rowCount } = await botQuery(
      `DELETE FROM keywords WHERE id = $1`,
      [numId],
    );

    if ((rowCount ?? 0) === 0) return jsonError("Not found", 404);
    return jsonOk({ deleted: numId });
  } catch (err) {
    return handleApiError(err);
  }
}
