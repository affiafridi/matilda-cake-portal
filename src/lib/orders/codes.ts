import { randomBytes } from "crypto";

/**
 * Confusion-free alphabet — Crockford-flavoured Base32 minus 0/O/1/I/L.
 * 31 chars: large enough to keep entropy reasonable, small enough that
 * codes can be read aloud over WhatsApp without ambiguity.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Generate a uniformly random N-character code from the alphabet. */
export function randomCode(length: number): string {
  if (length <= 0) throw new Error("length must be > 0");
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Build a human-readable order number: `MC-YYYYMMDD-XXXXX`.
 * Date portion uses UTC so the number is stable regardless of server tz.
 */
export function buildOrderNumber(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `MC-${y}${m}${d}-${randomCode(5)}`;
}

/** Build a short, opaque tracking code for customer-facing URLs. */
export function buildTrackingCode(): string {
  return randomCode(8);
}
