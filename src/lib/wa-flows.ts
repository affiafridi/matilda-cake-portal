import "server-only";
import * as crypto from "crypto";

export type FlowRequest = {
  version:    string;
  action:     "INIT" | "BACK" | "data_exchange" | "ping";
  flow_token: string;
  screen?:    string;
  data?:      Record<string, unknown>;
};

export type FlowResponse = {
  version: string;
  screen:  string;
  data:    Record<string, unknown>;
};

type DecryptResult = {
  payload: FlowRequest;
  aesKey:  Buffer;
  iv:      Buffer;
};

export function decryptFlowRequest(
  body: { encrypted_flow_data: string; encrypted_aes_key: string; initial_vector: string },
  privateKeyPem: string,
): DecryptResult {
  // Decrypt the per-request AES-128 key using RSA-OAEP (SHA-256)
  const aesKey = crypto.privateDecrypt(
    {
      key:       privateKeyPem,
      padding:   crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash:  "sha256",
    },
    Buffer.from(body.encrypted_aes_key, "base64"),
  );

  const iv            = Buffer.from(body.initial_vector, "base64");
  const encryptedData = Buffer.from(body.encrypted_flow_data, "base64");

  // Last 16 bytes are the GCM auth tag
  const TAG_LEN      = 16;
  const ciphertext   = encryptedData.subarray(0, -TAG_LEN);
  const authTag      = encryptedData.subarray(-TAG_LEN);

  const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const payload   = JSON.parse(decrypted.toString("utf8")) as FlowRequest;

  return { payload, aesKey, iv };
}

export function encryptFlowResponse(
  response: FlowResponse,
  aesKey:   Buffer,
  iv:       Buffer,
): string {
  // Flip the last byte of IV for response encryption (Meta spec)
  const responseIv = Buffer.from(iv);
  responseIv[responseIv.length - 1] ^= 0xff;

  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, responseIv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(response), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Ciphertext + auth tag, base64-encoded
  return Buffer.concat([encrypted, tag]).toString("base64");
}

// ── Date helpers ──────────────────────────────────────────────────────────────

const DAY_NAMES  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Returns next `count` available delivery dates (skipping today, can skip Fri). */
export function buildDeliveryDates(count = 14): { id: string; title: string }[] {
  const dates: { id: string; title: string }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1); // start from tomorrow

  while (dates.length < count) {
    const day  = cursor.getDay();
    // Skip Fridays (day 5) — adjust if business is open on Fridays
    if (day !== 5) {
      const yyyy = cursor.getFullYear();
      const mm   = String(cursor.getMonth() + 1).padStart(2, "0");
      const dd   = String(cursor.getDate()).padStart(2, "0");
      const id   = `${yyyy}-${mm}-${dd}`;
      const title = `${DAY_NAMES[day]} ${MONTH_NAMES[cursor.getMonth()]} ${String(cursor.getDate()).padStart(2, "0")} ${yyyy}`;
      dates.push({ id, title });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// Slot hours in 24h for comparison (matches the id strings below)
const ALL_SLOTS: { id: string; title: string; hour24: number }[] = [
  { id: "10:00 AM", title: "10:00 AM", hour24: 10 },
  { id: "12:00 PM", title: "12:00 PM", hour24: 12 },
  { id: "2:00 PM",  title: "2:00 PM",  hour24: 14 },
  { id: "4:00 PM",  title: "4:00 PM",  hour24: 16 },
  { id: "6:00 PM",  title: "6:00 PM",  hour24: 18 },
  { id: "8:00 PM",  title: "8:00 PM",  hour24: 20 },
];

/**
 * Returns available time slots for the given date (YYYY-MM-DD).
 * If the date is today, slots within 1 hour of the current time are removed.
 * Gap can be adjusted via the `gapHours` parameter.
 */
export function getAvailableTimeSlots(
  dateId: string,
  gapHours = 1,
  timezone = "Asia/Dubai",
): { id: string; title: string }[] {
  const now = new Date();

  // Get today's date string in the business timezone
  const todayId = now.toLocaleDateString("en-CA", { timeZone: timezone }); // "YYYY-MM-DD"

  if (dateId !== todayId) {
    // Future date — all slots available
    return ALL_SLOTS.map(({ id, title }) => ({ id, title }));
  }

  // Same-day order — filter slots that are at least `gapHours` ahead
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const cutoff  = nowHour + gapHours;

  return ALL_SLOTS
    .filter((s) => s.hour24 > cutoff)
    .map(({ id, title }) => ({ id, title }));
}
