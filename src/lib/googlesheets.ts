import "server-only";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
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

async function getDriveClient() {
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

  return google.drive({ version: "v3", auth: oauth });
}

// ── Sheet helpers ──────────────────────────────────────────────────────────

async function ensureTab(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const meta   = await sheets.spreadsheets.get({ spreadsheetId });
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

/** List all Google Sheets the user has access to (for the picker dropdown). */
export async function listUserSheets(): Promise<{ id: string; name: string }[]> {
  const drive = await getDriveClient();
  const res   = await drive.files.list({
    q:      "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id, name)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
  });
  return (res.data.files ?? []).map((f) => ({ id: f.id!, name: f.name! }));
}

/** Append one customer row — skips duplicates. Called on new WhatsApp contact. */
export async function appendCustomerRow(data: {
  phone: string; name: string; source?: string; firstSeen?: Date;
}): Promise<void> {
  const sheetId = await getSetting("google_sheet_id");
  if (!sheetId) return; // no sheet selected yet

  try {
    const sheets = await getSheetsClient();
    await ensureTab(sheets, sheetId);

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId, range: `${SHEET_TAB}!A:A`,
    });
    const phones = (existing.data.values ?? []).flat();
    if (phones.includes(data.phone)) return;

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId, range: `${SHEET_TAB}!A1`,
      valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          data.phone, data.name, data.source ?? "WhatsApp",
          data.firstSeen ? data.firstSeen.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          "Active",
        ]],
      },
    });
  } catch (err) {
    console.error("[sheets] appendCustomerRow failed:", err);
  }
}

/** Bulk export — clears the sheet and rewrites all rows. */
export async function exportAllCustomers(customers: {
  phone: string; name: string; source?: string;
  firstSeen?: Date | null; status?: string;
}[]): Promise<{ sheetUrl: string; count: number }> {
  const sheetId = await getSetting("google_sheet_id");
  if (!sheetId) throw new Error("No sheet selected. Please pick a sheet first.");

  const sheets = await getSheetsClient();
  await ensureTab(sheets, sheetId);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId, range: `${SHEET_TAB}!A2:Z`,
  });

  if (customers.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId, range: `${SHEET_TAB}!A2`,
      valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: customers.map((c) => [
          c.phone, c.name, c.source ?? "WhatsApp",
          c.firstSeen ? c.firstSeen.toISOString().slice(0, 10) : "",
          c.status ?? "Active",
        ]),
      },
    });
  }

  return { sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`, count: customers.length };
}

export async function isSheetsConfigured(): Promise<boolean> {
  return isOAuthConfigured();
}
