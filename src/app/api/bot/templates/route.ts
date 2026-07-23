import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { wa_business_account_id: businessId, wa_access_token: token } = await getIntegrations();
    if (!businessId || !token) return jsonError("WhatsApp not configured", 500);

    const all = req.nextUrl.searchParams.get("all") === "1";

    const res = await fetch(
      `https://graph.facebook.com/v22.0/${businessId}/message_templates?fields=id,name,status,language,category,components{type,format,text,example{header_url,header_handle,body_text},buttons{type,text,url,phone_number,example}}&limit=200`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = await res.json();
    if (json.error) return jsonError(json.error.message, 400);

    // Normalize templates: Meta (especially on deprecated API versions) may omit
    // the `format` field from HEADER components and/or the `example` media URL/handle.
    // For those templates, do a per-template GET to fill in missing data.
    const rawData: unknown[] = json.data ?? [];
    const data = await Promise.all(
      rawData.map(async (t: unknown) => {
        const template = t as Record<string, unknown>;
        const components = (template.components ?? []) as Array<Record<string, unknown>>;
        let header = components.find((c) => c.type === "HEADER");

        const example = (header?.example ?? {}) as Record<string, unknown>;
        const hasHandle = (example.header_handle as string[] | undefined)?.[0];
        const hasUrl    = (example.header_url    as string[] | undefined)?.[0];
        const missingFormat = !header?.format;
        const missingMedia  = !hasHandle && !hasUrl;
        const isPending = template.status === "PENDING";

        // Skip if everything is already present and not a pending template (pending often has incomplete data)
        if (header && !missingFormat && !missingMedia && !isPending) return template;
        if (!header && !isPending) return template;

        // Fetch the template individually — returns complete component data regardless of status
        try {
          const assetRes = await fetch(
            `https://graph.facebook.com/v22.0/${template.id}?fields=components`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const assetJson = await assetRes.json() as Record<string, unknown>;
          const assetComps = (assetJson.components ?? []) as Array<Record<string, unknown>>;
          const assetHeader = assetComps.find((c) => c.type === "HEADER");

          if (assetHeader) {
            if (!header) {
              // Header was missing from list response — inject it
              components.push(assetHeader);
              header = assetHeader;
            } else {
              if (missingFormat && assetHeader.format) header.format = assetHeader.format;
              if (missingMedia) {
                const assetEx = (assetHeader.example ?? {}) as Record<string, unknown>;
                const assetHandle = (assetEx.header_handle as string[] | undefined)?.[0];
                const assetUrl    = (assetEx.header_url    as string[] | undefined)?.[0];
                if (assetHandle || assetUrl) {
                  header.example = { ...example, ...(assetHandle ? { header_handle: [assetHandle] } : {}), ...(assetUrl ? { header_url: [assetUrl] } : {}) };
                }
              }
            }
          }
        } catch { /* ignore — best-effort */ }

        // Final fallback: infer format from example data if still missing
        if (header && !header.format) {
          if ((header.example as Record<string, unknown> | undefined)?.header_handle) header.format = "IMAGE";
          else if ((header.example as Record<string, unknown> | undefined)?.header_url) {
            const url = ((header.example as Record<string, unknown>).header_url as string[])?.[0] ?? "";
            header.format = url.toLowerCase().includes(".mp4") ? "VIDEO" : url.toLowerCase().includes(".pdf") ? "DOCUMENT" : "IMAGE";
          }
        }

        return template;
      })
    );

    const filtered = all
      ? data
      : data.filter((t) => (t as Record<string, unknown>).status === "APPROVED");

    return jsonOk(filtered);
  } catch (err) {
    return handleApiError(err);
  }
}
