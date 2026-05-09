import "server-only";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "mc_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a new session row + return the plaintext token to set in the cookie.
 * The plaintext is never persisted — only its sha256 hash.
 */
export async function createSession(
  userId: string,
  meta?: { ip?: string; ua?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
      ipAddress: meta?.ip ?? null,
      userAgent: meta?.ua ?? null,
    },
  });
  return { token, expiresAt };
}

export async function destroySessionByToken(token: string): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  await prisma.session.deleteMany({ where: { tokenHash } });
}

export async function getSessionByToken(token: string) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // Best-effort touch (don't block on it).
  prisma.session
    .update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});
  return session;
}

// ---------- Cookie helpers (Next 15 makes cookies() async) ----------

export async function setSessionCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionCookieValue(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}
