import { getCurrentUser } from "@/lib/auth/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const u = await getCurrentUser();
    if (!u) return jsonError("Not authenticated", 401);
    return jsonOk({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
