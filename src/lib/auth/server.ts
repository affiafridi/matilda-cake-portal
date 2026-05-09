import "server-only";
import type { User, UserRole } from "@prisma/client";
import {
  getSessionByToken,
  getSessionCookieValue,
} from "./sessions";
import { AuthError } from "./errors";

export { AuthError };

/** Returns the current user or null. Inactive users are treated as anonymous. */
export async function getCurrentUser(): Promise<User | null> {
  const token = await getSessionCookieValue();
  if (!token) return null;
  const session = await getSessionByToken(token);
  if (!session) return null;
  if (!session.user.isActive) return null;
  return session.user;
}

/** Throws AuthError(401) when no user is logged in. */
export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError(401, "Authentication required");
  return u;
}

/** Throws 401 when not logged in, 403 when role isn't allowed. */
export async function requireRole(
  allowed: readonly UserRole[],
): Promise<User> {
  const u = await requireUser();
  if (!allowed.includes(u.role)) throw new AuthError(403, "Forbidden");
  return u;
}

/** Convenience aliases. */
export const ROLE_GROUPS = {
  ADMINS: ["SUPER_ADMIN", "ADMIN"] as const,
  ADMINS_AND_COORDINATORS: ["SUPER_ADMIN", "ADMIN", "COORDINATOR"] as const,
  ADMINS_AND_CHEFS: ["SUPER_ADMIN", "ADMIN", "CHEF"] as const,
};
