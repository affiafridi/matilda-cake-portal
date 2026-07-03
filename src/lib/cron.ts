import { botQuery } from "./botdb";
import { sendCampaign } from "./wa/sendCampaign";

let started = false;

async function runDueCampaigns() {
  try {
    const claimed = await botQuery(
      `UPDATE scheduled_campaigns
       SET status = 'processing'
       WHERE status = 'pending' AND send_at <= NOW()
       RETURNING id, template_name, template_language, customers, payload`,
    );

    if ((claimed.rowCount ?? 0) === 0) return;

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

        await botQuery(`UPDATE scheduled_campaigns SET status = 'sent' WHERE id = $1`, [id]);
      } catch (err) {
        await botQuery(
          `UPDATE scheduled_campaigns SET status = 'failed', error = $1 WHERE id = $2`,
          [String(err), id],
        );
      }
    }
  } catch (err) {
    console.error("[cron] runDueCampaigns failed:", err);
  }
}

export function startCron() {
  if (started) return;
  started = true;

  // Run immediately on startup, then every 60 seconds
  runDueCampaigns();
  setInterval(runDueCampaigns, 60_000);
}
