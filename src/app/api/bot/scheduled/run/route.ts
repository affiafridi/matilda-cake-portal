import type { NextRequest } from "next/server";
import { botQuery } from "@/lib/botdb";
import { sendCampaign } from "@/lib/wa/sendCampaign";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret — required, not optional
    const secret = process.env.CRON_SECRET;
    if (!secret) return jsonError("CRON_SECRET not configured", 500);
    const auth = req.headers.get("x-cron-secret");
    if (auth !== secret) return jsonError("Forbidden", 403);

    // Claim all pending campaigns whose send_at has passed (atomic update to avoid double-sends)
    const claimed = await botQuery(
      `UPDATE scheduled_campaigns
       SET status = 'processing'
       WHERE status = 'pending' AND send_at <= NOW()
       RETURNING id, template_name, template_language, customers, payload`,
    );

    if ((claimed.rowCount ?? 0) === 0) return jsonOk({ processed: 0 });

    const processed: { id: number; sent: number; failed: number }[] = [];

    for (const row of claimed.rows) {
      const { id, template_name, template_language, customers, payload } = row;
      try {
        const result = await sendCampaign({
          customers:        Array.isArray(customers) ? customers : JSON.parse(customers),
          templateName:     template_name,
          templateLanguage: template_language,
          ...(typeof payload === "object" ? payload : JSON.parse(payload ?? "{}")),
        });

        if ("error" in result) throw new Error(result.error);

        await botQuery(
          `UPDATE scheduled_campaigns SET status = 'sent' WHERE id = $1`,
          [id],
        );
        processed.push({ id, sent: result.sent, failed: result.failed });
      } catch (err) {
        await botQuery(
          `UPDATE scheduled_campaigns SET status = 'failed', error = $1 WHERE id = $2`,
          [String(err), id],
        );
      }
    }

    return jsonOk({ processed: processed.length, details: processed });
  } catch (err) {
    return handleApiError(err);
  }
}
