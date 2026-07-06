import "server-only";
import { botQuery } from "@/lib/botdb";
import { getIntegrations } from "@/lib/integrations";

type SendPayload = {
  customers: string[];
  templateName: string;
  templateLanguage: string;
  imageUrl?: string;
  headerFormat?: string;
  bodyVarCount: number;
  extraBodyVars: string[];
  urlSuffix?: string;
  urlButtonIndex?: number;
  couponCode?: string;
  couponButtonIndex?: number;
};

type SendResult = {
  sent: number;
  failed: number;
  results: { wa_id: string; status: string; error?: string }[];
};

async function uploadImageToMeta(
  imageUrl: string,
  phoneNumberId: string,
  token: string,
): Promise<{ id: string } | { error: string }> {
  // SSRF protection — only allow public HTTPS URLs
  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol !== "https:") return { error: "Image URL must use HTTPS." };
    const host = parsed.hostname.toLowerCase();
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|metadata\.)/.test(host)) {
      return { error: "Invalid image URL." };
    }
  } catch {
    return { error: "Invalid image URL." };
  }

  const res = await fetch(imageUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
  }).catch(() => null);

  if (!res?.ok) return { error: `Could not download image (HTTP ${res?.status ?? "unreachable"}).` };

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) return { error: "Downloaded image is empty." };

  let contentType = res.headers.get("content-type")?.split(";")[0].trim() ?? "image/jpeg";
  if (!["image/jpeg", "image/png"].includes(contentType)) {
    const lc = imageUrl.toLowerCase().split("?")[0];
    contentType = lc.endsWith(".png") ? "image/png" : "image/jpeg";
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", contentType);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: contentType }), "header.jpg");

  const uploadRes = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/media`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
  ).catch(() => null);

  if (!uploadRes?.ok) return { error: `Meta media upload failed (HTTP ${uploadRes?.status ?? "unreachable"}).` };

  const uploadJson = await uploadRes.json() as { id?: string; error?: { message: string; error_user_msg?: string } };
  if (!uploadJson.id) {
    const msg = uploadJson.error?.error_user_msg ?? uploadJson.error?.message ?? "Unknown error";
    return { error: `Meta media upload failed: ${msg}` };
  }

  return { id: uploadJson.id };
}

export async function sendCampaign(payload: SendPayload): Promise<SendResult | { error: string }> {
  const {
    customers, templateName, templateLanguage,
    imageUrl, headerFormat, bodyVarCount, extraBodyVars,
    urlSuffix, urlButtonIndex, couponCode, couponButtonIndex,
  } = payload;

  const { wa_phone_number_id: phoneNumberId, wa_access_token: token } = await getIntegrations();
  if (!phoneNumberId || !token) return { error: "WhatsApp not configured" };

  // Upload image once
  let mediaId: string | undefined;
  if (imageUrl && headerFormat) {
    const result = await uploadImageToMeta(imageUrl, phoneNumberId, token);
    if ("error" in result) return result;
    mediaId = result.id;
  }

  // Fetch customer names
  const nameMap: Record<string, string> = {};
  if (bodyVarCount >= 1) {
    try {
      const { rows } = await botQuery<{ wa_id: string; name: string }>(
        `SELECT wa_id, name FROM customers WHERE wa_id = ANY($1)`,
        [customers],
      );
      for (const row of rows) nameMap[row.wa_id] = row.name || "";
    } catch { /* proceed without names */ }
  }

  // Static components (same for all recipients)
  const staticComponents: object[] = [];
  if (mediaId && headerFormat) {
    const fmt = headerFormat.toLowerCase();
    const paramType = fmt === "video" ? "video" : fmt === "document" ? "document" : "image";
    staticComponents.push({ type: "header", parameters: [{ type: paramType, [paramType]: { id: mediaId } }] });
  }
  if (urlSuffix !== undefined && urlButtonIndex !== undefined) {
    staticComponents.push({ type: "button", sub_type: "url", index: String(urlButtonIndex), parameters: [{ type: "text", text: urlSuffix }] });
  }
  if (couponCode && couponButtonIndex !== undefined) {
    staticComponents.push({ type: "button", sub_type: "copy_code", index: String(couponButtonIndex), parameters: [{ type: "coupon_code", coupon_code: couponCode }] });
  }

  // Send per customer
  const results: { wa_id: string; status: string; error?: string }[] = [];

  for (const waId of customers) {
    const components: object[] = [...staticComponents];
    if (bodyVarCount >= 1) {
      const customerName = nameMap[waId] || waId;
      const bodyParams = [
        { type: "text", text: customerName },
        ...extraBodyVars.map((v) => ({ type: "text", text: v })),
      ].slice(0, bodyVarCount);
      components.push({ type: "body", parameters: bodyParams });
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: waId,
            type: "template",
            template: {
              name: templateName,
              language: { code: templateLanguage },
              ...(components.length > 0 ? { components } : {}),
            },
          }),
        },
      );

      const json = await res.json() as {
        messages?: { id: string }[];
        error?: { code?: number; message: string; error_user_msg?: string; error_user_title?: string };
      };

      if (json.error) {
        const detail = json.error.error_user_msg ?? json.error.error_user_title ?? "";
        results.push({ wa_id: waId, status: "failed", error: `[#${json.error.code ?? "?"}] ${json.error.message}${detail ? ` — ${detail}` : ""}` });
      } else if (json.messages?.[0]?.id) {
        results.push({ wa_id: waId, status: "sent" });
      } else {
        results.push({ wa_id: waId, status: "failed", error: `Unexpected: ${JSON.stringify(json)}` });
      }
    } catch (e) {
      results.push({ wa_id: waId, status: "failed", error: `Network error: ${String(e)}` });
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  const sent   = results.filter((r) => r.status === "sent").length;
  const failed = results.length - sent;

  // Log to campaign_logs
  try {
    await botQuery(
      `INSERT INTO campaign_logs (template_name, template_language, total, sent, failed, results)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [templateName, templateLanguage, customers.length, sent, failed, JSON.stringify(results)],
    );
  } catch { /* log silently */ }

  return { sent, failed, results };
}
