import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/passwords";
import { createSession, setSessionCookie } from "@/lib/auth/sessions";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// A pre-computed bcrypt hash so failed lookups still burn ~bcrypt time —
// reduces user-enumeration via timing.
const DUMMY_HASH =
  "$2a$12$abcdefghijklmnopqrstuv8RxJjQpZc8NwLk2K2vUZcS3jK1PqQOSO";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid email or password.", 401);
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });

    // Single generic message for "user not found", "inactive", and
    // "wrong password" — no user enumeration.
    if (!user || !user.passwordHash || !user.isActive) {
      await verifyPassword(parsed.data.password, DUMMY_HASH);
      return jsonError("Invalid email or password.", 401);
    }

    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) return jsonError("Invalid email or password.", 401);

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined;
    const ua = req.headers.get("user-agent") ?? undefined;
    const { token, expiresAt } = await createSession(user.id, { ip, ua });
    await setSessionCookie(token, expiresAt);

    return jsonOk({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
