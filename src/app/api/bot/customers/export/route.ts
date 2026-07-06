import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtDate(val: unknown): string {
  if (!val) return "";
  const d = new Date(val as string);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-AE", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "Asia/Dubai",
  });
}

function csvCell(val: unknown): string {
  const s = String(val ?? "");
  // If it contains comma, newline or quote — wrap in quotes and escape inner quotes
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(_req: NextRequest) {
  try {
    const { rows } = await botQuery(
      `SELECT wa_id, name, language, total_messages,
              COALESCE(tags, '{}') AS tags,
              first_seen, last_seen
       FROM customers ORDER BY last_seen DESC`,
    );

    const headers = ["Phone (WA ID)", "Name", "Language", "Total Messages", "Tags", "First Seen", "Last Seen"];

    const lines = [
      headers.join(","),
      ...rows.map((r) => [
        // Prefix with tab so Excel treats the number as text, not scientific notation
        `\t${r.wa_id}`,
        csvCell(r.name ?? ""),
        csvCell(r.language ?? ""),
        r.total_messages ?? 0,
        csvCell(Array.isArray(r.tags) ? r.tags.join("; ") : ""),
        fmtDate(r.first_seen),
        fmtDate(r.last_seen),
      ].join(",")),
    ];

    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
