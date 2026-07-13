import "server-only";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
];

const SHEET_TAB  = "Customers";
const HEADERS    = ["Phone", "Name", "Source", "First Seen", "Status"];

// ── OAuth client ───────────────────────────────────────────────────────────

async function getOAuthCredentials() {
  const [clientId, clientSecret] = await Promise.all([
    getSetting("google_oauth_client_id"),
    getSetting("google_oauth_client_secret"),
  ]);
  return {
    clientId:     clientId     || process.env.GOOGLE_OAUTH_CLIENT_ID     || "",
    clientSecret: clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
  };
}

export async function getOAuthClient() {
  const { clientId, clientSecret } = await getOAuthCredentials();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured. Go to Integrations → Google OAuth to add them.");

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${appUrl}/api/admin/integrations/google/callback`,
  );
}

export async function isOAuthConfigured(): Promise<boolean> {
  const { clientId, clientSecret } = await getOAuthCredentials();
  return !!(clientId && clientSecret);
}

export async function getAuthUrl(): Promise<string> {
  const oauth = await getOAuthClient();
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

// ── Token storage (portal_settings) ───────────────────────────────────────

async function saveSetting(key: string, value: string) {
  await prisma.$executeRaw`
    INSERT INTO portal_settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

async function getSetting(key: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ value: string }[]>`
    SELECT value FROM portal_settings WHERE key = ${key}
  `;
  return rows[0]?.value ?? null;
}

async function deleteSetting(key: string) {
  await prisma.$executeRaw`DELETE FROM portal_settings WHERE key = ${key}`;
}

export async function saveGoogleTokens(tokens: {
  access_token:  string;
  refresh_token: string;
  expiry_date:   number;
}) {
  await Promise.all([
    saveSetting("google_access_token",  tokens.access_token),
    saveSetting("google_refresh_token", tokens.refresh_token),
    saveSetting("google_token_expiry",  String(tokens.expiry_date)),
  ]);
}

export async function clearGoogleTokens() {
  await Promise.all([
    deleteSetting("google_access_token"),
    deleteSetting("google_refresh_token"),
    deleteSetting("google_token_expiry"),
    deleteSetting("google_sheet_id"),
    deleteSetting("google_sheet_name"),
  ]);
}

export async function saveSelectedSheet(id: string, name: string) {
  await Promise.all([
    saveSetting("google_sheet_id",   id),
    saveSetting("google_sheet_name", name),
  ]);
}

export async function getGoogleConnection(): Promise<{
  connected: boolean;
  sheetId: string | null;
  sheetName: string | null;
}> {
  const [accessToken, sheetId, sheetName] = await Promise.all([
    getSetting("google_access_token"),
    getSetting("google_sheet_id"),
    getSetting("google_sheet_name"),
  ]);
  return { connected: !!accessToken, sheetId, sheetName };
}

// ── Authenticated Sheets client ────────────────────────────────────────────

async function getSheetsClient() {
  const [accessToken, refreshToken, expiry] = await Promise.all([
    getSetting("google_access_token"),
    getSetting("google_refresh_token"),
    getSetting("google_token_expiry"),
  ]);

  if (!accessToken || !refreshToken) throw new Error("Google account not connected");

  const oauth = await getOAuthClient();
  oauth.setCredentials({
    access_token:  accessToken,
    refresh_token: refreshToken,
    expiry_date:   expiry ? Number(expiry) : undefined,
  });

  // Auto-refresh expired token
  oauth.on("tokens", async (tokens) => {
    if (tokens.access_token) await saveSetting("google_access_token", tokens.access_token);
    if (tokens.expiry_date)  await saveSetting("google_token_expiry",  String(tokens.expiry_date));
  });

  return google.sheets({ version: "v4", auth: oauth });
}


// ── Sheet helpers ──────────────────────────────────────────────────────────

async function ensureTab(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  let meta;
  try {
    meta = await sheets.spreadsheets.get({ spreadsheetId });
  } catch (err: unknown) {
    const code = (err as { code?: number | string })?.code ?? (err as { status?: number })?.status;
    if (code === 403 || String(code) === "403") throw new Error("forbidden: Google account does not have access to this sheet");
    if (code === 404 || String(code) === "404") throw new Error("not found: spreadsheet does not exist");
    throw err;
  }
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SHEET_TAB);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_TAB } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${SHEET_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Extract spreadsheet ID from a URL or return as-is if already an ID. */
export function parseSheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : input.trim();
}

/** Validate a sheet ID by fetching its title. Returns the sheet title or throws. */
export async function validateSheetId(sheetId: string): Promise<string> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "properties.title" });
  return res.data.properties?.title ?? sheetId;
}

/** Fetch all phone numbers already in the sheet (column A, skipping header). */
async function getExistingPhones(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<Set<string>> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!A2:A`, // skip row 1 (header)
  });
  const phones = (res.data.values ?? []).flat().map((v) => String(v).trim());
  return new Set(phones);
}

/** Normalise a phone string for comparison — strip leading + and spaces. */
function normalisePhone(phone: string): string {
  return phone.replace(/^\+/, "").replace(/\s/g, "").trim();
}

/** Append one customer row — skips if phone already exists. Called on new WhatsApp contact. */
export async function appendCustomerRow(data: {
  phone: string; name: string; source?: string; firstSeen?: Date;
}): Promise<void> {
  const sheetId = await getSetting("google_sheet_id");
  if (!sheetId) return;

  try {
    const sheets = await getSheetsClient();
    await ensureTab(sheets, sheetId);

    const existing = await getExistingPhones(sheets, sheetId);
    if (existing.has(normalisePhone(data.phone))) return; // already in sheet

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId, range: `${SHEET_TAB}!A2`,
      valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          normalisePhone(data.phone),
          data.name,
          data.source ?? "WhatsApp",
          data.firstSeen ? data.firstSeen.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          "Active",
        ]],
      },
    });
  } catch (err) {
    console.error("[sheets] appendCustomerRow failed:", err);
  }
}

/** Bulk export — deduplicates by phone before writing, then clears data rows and rewrites. */
export async function exportAllCustomers(customers: {
  phone: string; name: string; source?: string;
  firstSeen?: Date | null; status?: string;
}[]): Promise<{ sheetUrl: string; count: number }> {
  const sheetId = await getSetting("google_sheet_id");
  if (!sheetId) throw new Error("No sheet selected. Paste your Google Sheet URL first.");

  // Deduplicate by normalised phone — keep first occurrence
  const seen   = new Set<string>();
  const unique = customers.filter((c) => {
    const key = normalisePhone(c.phone);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sheets = await getSheetsClient();
  await ensureTab(sheets, sheetId);

  // Clear existing data rows (keep header in row 1)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId, range: `${SHEET_TAB}!A2:Z`,
  });

  if (unique.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${SHEET_TAB}!A2`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: unique.map((c) => [
          normalisePhone(c.phone),
          c.name,
          c.source ?? "WhatsApp",
          c.firstSeen ? c.firstSeen.toISOString().slice(0, 10) : "",
          c.status ?? "Active",
        ]),
      },
    });
  }

  return { sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`, count: unique.length };
}

export async function isSheetsConfigured(): Promise<boolean> {
  return isOAuthConfigured();
}
