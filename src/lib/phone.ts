/**
 * UAE phone number helpers.
 *
 * - `normalizeUaePhone(raw)` — accepts any common input format and produces
 *   a canonical E.164 / pretty display form. Used for ad-hoc validation.
 * - `maskUaeMobile(input)` — live mask for masked inputs (XX-XXXX-XXX).
 * - `unmaskUaeMobile(masked)` — strip the mask back to plain digits.
 * - `validateUaeMobile(digits)` — check digits against UAE mobile prefixes.
 */

const MOBILE_PREFIX = /^5[024568]/;          // 50, 52, 54, 55, 56, 58
const LANDLINE_PREFIX = /^[234679]/;          // AUH, AAN, DXB, SHJ/AJM/UAQ, RAK, FUJ

export type PhoneResult =
  | { ok: true; e164: string; display: string }
  | { ok: false; reason: string };

const HELPFUL_HINT = "Enter a valid UAE number, e.g. +971 50 123 4567";

export function normalizeUaePhone(raw: string): PhoneResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "Phone is required" };

  // Strip whitespace, dashes, parentheses
  const cleaned = trimmed.replace(/[\s\-()]/g, "");

  // Allowed characters: optional leading +, then digits only
  if (!/^\+?\d+$/.test(cleaned)) {
    return { ok: false, reason: "Use digits only — no letters or symbols" };
  }

  // Strip leading + or international 00
  let digits = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Strip country code or local 0 trunk
  if (digits.startsWith("971")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // Mobile — 9 digits, 5X prefix
  if (digits.length === 9 && MOBILE_PREFIX.test(digits)) {
    return {
      ok: true,
      e164: `+971${digits}`,
      display: `+971 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`,
    };
  }

  // Landline — 8 digits, area-code prefix
  if (digits.length === 8 && LANDLINE_PREFIX.test(digits)) {
    return {
      ok: true,
      e164: `+971${digits}`,
      display: `+971 ${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4)}`,
    };
  }

  return { ok: false, reason: HELPFUL_HINT };
}

// =====================================================
// Masked-input helpers (mobile only)
// =====================================================

/**
 * Live mask for a UAE mobile local-part.
 * Produces the running pattern `XX`, `XX-XXXX`, or `XX-XXXX-XXX`.
 * Strips non-digits and caps at 9 digits, so typing or pasting more
 * characters than fit will have no effect.
 *
 * Smart paste: if the input begins with `971` or a leading `0` and is longer
 * than 9 digits, those prefixes are stripped before masking — so pasting
 * `+971501234567` or `0501234567` both yield `50-1234-567`.
 */
export function maskUaeMobile(input: string): string {
  let digits = input.replace(/\D/g, "");

  if (digits.length > 9) {
    if (digits.startsWith("971")) digits = digits.slice(3);
    else if (digits.startsWith("0")) digits = digits.slice(1);
  }
  digits = digits.slice(0, 9);

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
}

/** Strip mask, return digits only. */
export function unmaskUaeMobile(masked: string): string {
  return masked.replace(/\D/g, "");
}

/** Validate 9-digit UAE mobile. */
export function validateUaeMobile(
  digits: string,
): { ok: true } | { ok: false; reason: string } {
  if (digits.length === 0) return { ok: false, reason: "Required" };
  if (digits.length < 9) return { ok: false, reason: "Number is incomplete" };
  if (!MOBILE_PREFIX.test(digits)) {
    return {
      ok: false,
      reason: "Mobile must start with 50, 52, 54, 55, 56 or 58",
    };
  }
  return { ok: true };
}
