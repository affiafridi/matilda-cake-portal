import {
  clearSessionCookie,
  destroySessionByToken,
  getSessionCookieValue,
} from "@/lib/auth/sessions";
import { handleApiError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";

export async function POST() {
  try {
    const token = await getSessionCookieValue();
    if (token) await destroySessionByToken(token);
    await clearSessionCookie();
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
