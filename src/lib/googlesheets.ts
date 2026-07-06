import "server-only";
import { google } from "googleapis";

/**
 * Google Sheets integration.
 * Auth: Service Account — no OAuth flow needed.
 *
 * Required env vars:
 *   GOOGLE_SHEETS_SPREADSHEET_ID  — the sheet ID from the URL
 *   GOOGLE_SHEETS_CLIENT_EMAIL    — service account email
 *   GOOGLE_SHEETS_PRIVATE_KEY     — service account private key (with \n as newlines)
 *
 * Sheet must be shared with the service account email (Editor access).
 */

function getClient() {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const key   = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google Sheets credentials not configured");

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export function isSheetsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID &&
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL &&
    process.env.GOOGLE_SHEETS_PRIVATE_KEY
  );
}

const SHEET_NAME  = "Customers";
const HEADERS     = ["Phone", "Name", "Source", "First Seen", "Status"];

/**
 * Ensures the sheet exists with correct headers.
 * Safe to call multiple times — won't duplicate headers.
 */
async function ensureSheet(spreadsheetId: string) {
  const sheets = getClient();

  // Check if sheet exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SHEET_NAME);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
      },
    });
    // Write headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
  }
}

/**
 * Appends a single customer row to the sheet.
 * Called automatically when a new conversation arrives.
 */
export async function appendCustomerRow(data: {
  phone: string;
  name: string;
  source?: string;
  firstSeen?: Date;
  status?: string;
}): Promise<void> {
  if (!isSheetsConfigured()) return;

  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
  await ensureSheet(spreadsheetId);

  const sheets = getClient();

  // Check if phone already exists — avoid duplicates
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:A`,
  });
  const phones = (existing.data.values ?? []).flat();
  if (phones.includes(data.phone)) return; // already in sheet

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        data.phone,
        data.name,
        data.source ?? "WhatsApp",
        data.firstSeen ? data.firstSeen.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        data.status ?? "Active",
      ]],
    },
  });
}

/**
 * Bulk export — clears the sheet and rewrites all rows.
 * Called from the export button in the portal.
 */
export async function exportAllCustomers(customers: {
  phone: string;
  name: string;
  source?: string;
  firstSeen?: Date | null;
  status?: string;
}[]): Promise<{ spreadsheetId: string; sheetUrl: string }> {
  if (!isSheetsConfigured()) throw new Error("Google Sheets not configured");

  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
  await ensureSheet(spreadsheetId);

  const sheets = getClient();

  // Clear existing data (keep headers row)
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:Z`,
  });

  if (customers.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A2`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: customers.map((c) => [
          c.phone,
          c.name,
          c.source ?? "WhatsApp",
          c.firstSeen ? c.firstSeen.toISOString().slice(0, 10) : "",
          c.status ?? "Active",
        ]),
      },
    });
  }

  return {
    spreadsheetId,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  };
}
