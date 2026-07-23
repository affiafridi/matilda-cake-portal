import "server-only";
import { botQuery } from "@/lib/botdb";
import { getIntegrations } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

type SendPayload = {
  customers: string[];
  templateName: string;
  templateLanguage: string;
  campaignName?: string;
  broadcastId?: string;  // pre-created broadcast record ID — skip creation if provided
  imageUrl?: string;
  headerHandle?: string;
  headerUrl?: string;
  headerFormat?: string;
  bodyVarCount: number;
  extraBodyVars: string[];
  urlSuffix?: string;
  urlIsWaId?: boolean;
  urlButtonIndex?: number;
  couponCode?: string;
  couponButtonIndex?: number;
};

type SendResult = {
  sent: number;
  failed: number;
  broadcastId?: string;
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
    `https://graph.facebook.com/v22.0/${phoneNumberId}/media`,
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

export async function createBroadcastRecord(
  name: string, templateName: string, templateLanguage: string, totalCount: number,
): Promise<string> {
  const bc = await prisma.broadcast.create({
    data: { name, templateName, templateLang: templateLanguage, totalCount, status: "SENDING" },
    select: { id: true },
  });
  return bc.id;
}

export async function sendCampaign(payload: SendPayload): Promise<SendResult | { error: string }> {
  const {
    customers, templateName, templateLanguage, campaignName,
    broadcastId: existingBroadcastId,
    imageUrl, headerHandle, headerUrl, headerFormat, bodyVarCount, extraBodyVars,
    urlSuffix, urlIsWaId, urlButtonIndex, couponCode, couponButtonIndex,
  } = payload;

  const { wa_phone_number_id: phoneNumberId, wa_access_token: token } = await getIntegrations();
  if (!phoneNumberId || !token) return { error: "WhatsApp not configured" };

  // Filter out customers who have opted out via STOP
  const optedOut = await prisma.conversation.findMany({
    where: { waId: { in: customers }, broadcastOptOutAt: { not: null } },
    select: { waId: true },
  }).catch(() => []);
  const optedOutIds = new Set(optedOut.map((c) => c.waId));
  const activeCustomers = customers.filter((id) => !optedOutIds.has(id));
  const skippedCount = customers.length - activeCustomers.length;

  // Resolve header image.
  // If the template already has a stored image (headerHandle or headerUrl), Meta sends it
  // automatically — no header component needed in the send request (the image is baked into
  // the approved template, not a variable). Only upload when user provides a fresh imageUrl.
  let mediaId: string | undefined;
  const hasStoredImage = !!(headerHandle || headerUrl);

  if (!hasStoredImage && imageUrl && headerFormat) {
    const result = await uploadImageToMeta(imageUrl, phoneNumberId, token);
    if ("error" in result) return result;
    mediaId = result.id;
  }

  // Early exit if everyone opted out
  if (activeCustomers.length === 0) {
    if (existingBroadcastId) {
      await prisma.broadcast.update({
        where: { id: existingBroadcastId },
        data: { totalCount: 0, skippedCount, status: "COMPLETED", completedAt: new Date() },
      }).catch(() => {});
    }
    return { sent: 0, failed: 0, broadcastId: existingBroadcastId, results: [] };
  }

  // Fetch customer names (only for active customers)
  const nameMap: Record<string, string> = {};
  if (bodyVarCount >= 1) {
    try {
      const { rows } = await botQuery<{ wa_id: string; name: string }>(
        `SELECT wa_id, name FROM customers WHERE wa_id = ANY($1)`,
        [activeCustomers],
      );
      for (const row of rows) nameMap[row.wa_id] = row.name || "";
    } catch { /* proceed without names */ }
  }

  // Static components (same for all recipients)
  const staticComponents: object[] = [];
  if (mediaId && headerFormat) {
    // Only include header component when user provided a fresh image URL to upload.
    // For templates with stored images (headerHandle/headerUrl), Meta sends the approved
    // template image automatically — no header component needed.
    const fmt = headerFormat.toLowerCase();
    const paramType = fmt === "video" ? "video" : fmt === "document" ? "document" : "image";
    staticComponents.push({ type: "header", parameters: [{ type: paramType, [paramType]: { id: mediaId } }] });
  }
  // Static URL suffix (same for all customers — not waId mode)
  if (urlSuffix !== undefined && urlButtonIndex !== undefined && !urlIsWaId) {
    staticComponents.push({ type: "button", sub_type: "url", index: String(urlButtonIndex), parameters: [{ type: "text", text: urlSuffix }] });
  }
  if (couponCode && couponButtonIndex !== undefined) {
    staticComponents.push({ type: "button", sub_type: "copy_code", index: String(couponButtonIndex), parameters: [{ type: "coupon_code", coupon_code: couponCode }] });
  }

  // Use pre-created broadcast record or create one now
  let broadcastId: string | undefined = existingBroadcastId;
  if (!broadcastId) {
    try {
      broadcastId = await createBroadcastRecord(
        campaignName ?? templateName, templateName, templateLanguage, activeCustomers.length,
      );
    } catch { /* non-fatal */ }
  } else {
    // Update totalCount to active recipients; record how many were skipped
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { totalCount: activeCustomers.length, skippedCount },
    }).catch(() => {});
  }

  // Send per customer
  const results: { wa_id: string; status: string; error?: string }[] = [];

  for (const waId of activeCustomers) {
    const components: object[] = [...staticComponents];
    // Per-customer URL suffix: use the customer's WhatsApp number (waId tracking links)
    if (urlIsWaId && urlButtonIndex !== undefined) {
      components.push({ type: "button", sub_type: "url", index: String(urlButtonIndex), parameters: [{ type: "text", text: waId }] });
    }
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
        `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
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
        const errMsg = `[#${json.error.code ?? "?"}] ${json.error.message}${detail ? ` — ${detail}` : ""}`;
        results.push({ wa_id: waId, status: "failed", error: errMsg });
        if (broadcastId) {
          await prisma.broadcastRecipient.create({ data: { broadcastId, waId, customerName: nameMap[waId] ?? null, status: "FAILED", errorMsg: errMsg, failedAt: new Date() } }).catch(() => {});
          await prisma.broadcast.update({ where: { id: broadcastId }, data: { failedCount: { increment: 1 } } }).catch(() => {});
        }
      } else if (json.messages?.[0]?.id) {
        const waMessageId = json.messages[0].id;
        results.push({ wa_id: waId, status: "sent" });
        if (broadcastId) {
          await prisma.broadcastRecipient.create({ data: { broadcastId, waId, customerName: nameMap[waId] ?? null, waMessageId, status: "SENT", sentAt: new Date() } }).catch(() => {});
          await prisma.broadcast.update({ where: { id: broadcastId }, data: { sentCount: { increment: 1 } } }).catch(() => {});
        }
      } else {
        const errMsg = `Unexpected: ${JSON.stringify(json)}`;
        results.push({ wa_id: waId, status: "failed", error: errMsg });
        if (broadcastId) {
          await prisma.broadcastRecipient.create({ data: { broadcastId, waId, customerName: nameMap[waId] ?? null, status: "FAILED", errorMsg: errMsg, failedAt: new Date() } }).catch(() => {});
          await prisma.broadcast.update({ where: { id: broadcastId }, data: { failedCount: { increment: 1 } } }).catch(() => {});
        }
      }
    } catch (e) {
      results.push({ wa_id: waId, status: "failed", error: `Network error: ${String(e)}` });
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  const sent   = results.filter((r) => r.status === "sent").length;
  const failed = results.length - sent;

  // Mark broadcast complete
  if (broadcastId) {
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: "COMPLETED", completedAt: new Date() },
    }).catch(() => {});
  }

  // Log to campaign_logs
  try {
    await botQuery(
      `INSERT INTO campaign_logs (template_name, template_language, total, sent, failed, results)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [templateName, templateLanguage, activeCustomers.length, sent, failed, JSON.stringify(results)],
    );
  } catch { /* log silently */ }

  return { sent, failed, broadcastId, results };
}
