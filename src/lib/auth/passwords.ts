import "server-only";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export type PasswordValidation =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Enforce: min 8 chars, at least one uppercase, lowercase, number, and
 * special character. Used at the application layer when admins create or
 * reset a user's password.
 */
export function validatePasswordStrength(
  plain: string,
): PasswordValidation {
  if (typeof plain !== "string") {
    return { ok: false, reason: "Password is required." };
  }
  if (plain.length < 8) {
    return { ok: false, reason: "Password must be at least 8 characters." };
  }
  if (!/[A-Z]/.test(plain)) {
    return { ok: false, reason: "Password must include an uppercase letter." };
  }
  if (!/[a-z]/.test(plain)) {
    return { ok: false, reason: "Password must include a lowercase letter." };
  }
  if (!/[0-9]/.test(plain)) {
    return { ok: false, reason: "Password must include a number." };
  }
  if (!/[^A-Za-z0-9]/.test(plain)) {
    return {
      ok: false,
      reason: "Password must include a special character.",
    };
  }
  return { ok: true };
}
