import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser, ROLE_GROUPS } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Proper CSV row parser — handles quoted fields containing commas and newlines
function parseCSVRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: escaped quote ""
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { cells.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
  }
  cells.push(cur.trim());
  return cells;
}

// Strip Excel text-number prefix (\t or leading apostrophe) and whitespace
function cleanPhone(raw: string): string {
  return raw.replace(/^[\t\s'=]+/, "").replace(/[\s]/g, "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !ROLE_GROUPS.ADMINS.includes(user.role as "SUPER_ADMIN" | "ADMIN")) return jsonError("Forbidden", 403);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") return jsonError("No file uploaded", 400);

    const text = await (file as File).text();
    // Normalise line endings
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return jsonError("CSV has no data rows", 400);

    // Parse header to find column positions (case-insensitive)
    const headerCells = parseCSVRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const colPhone = headerCells.findIndex((h) => h.includes("phone") || h.includes("waid") || h.includes("wa_id"));
    const colName  = headerCells.findIndex((h) => h.includes("name"));

    if (colPhone === -1) return jsonError("Could not find a 'Phone' or 'WA ID' column in the CSV header", 400);

    let inserted = 0;
    let skipped  = 0;

    for (const line of lines.slice(1)) {
      const cols  = parseCSVRow(line);
      const waId  = cleanPhone(cols[colPhone] ?? "");
      const name  = colName >= 0 ? (cols[colName] ?? "").trim() : "";

      // Must be a numeric WA ID (10–15 digits)
      if (!waId || !/^\d{10,15}$/.test(waId)) { skipped++; continue; }

      await botQuery(
        `INSERT INTO customers (wa_id, name)
         VALUES ($1, $2)
         ON CONFLICT (wa_id) DO UPDATE SET
           name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE customers.name END`,
        [waId, name || null],
      );
      inserted++;
    }

    return jsonOk({ inserted, skipped });
  } catch (err) {
    return handleApiError(err);
  }
}
