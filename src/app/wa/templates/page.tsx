"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────

type TemplateButton = { type: string; text: string; url?: string; example?: string[] };
type TemplateComponent = {
  type: string; text?: string; format?: string;
  example?: { body_text?: string[][] };
  buttons?: TemplateButton[];
};
type Template = {
  id: string; name: string; status: string;
  language: string; category: string;
  components: TemplateComponent[];
};
type CampaignResult = {
  sent: number; failed: number;
  results: { wa_id: string; status: string; error?: string }[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function getComp(t: Template, type: string) {
  return t.components.find((c) => c.type === type);
}

function hasImageHeader(t: Template) {
  const h = getComp(t, "HEADER");
  return h?.format === "IMAGE" || h?.format === "VIDEO" || h?.format === "DOCUMENT";
}

// Count unique {{n}} variables in body text
function countBodyVars(t: Template): number {
  const body = getComp(t, "BODY");
  if (!body?.text) return 0;
  const matches = body.text.match(/\{\{(\d+)\}\}/g) ?? [];
  return new Set(matches.map((m) => m.replace(/\{|\}/g, ""))).size;
}

// Find dynamic URL button (url contains {{1}}) and its index in the buttons array
function getDynamicUrlButton(t: Template): { btn: TemplateButton; idx: number } | null {
  const btns = getComp(t, "BUTTONS")?.buttons ?? [];
  for (let i = 0; i < btns.length; i++) {
    if (btns[i].type === "URL" && btns[i].url?.includes("{{1}}")) return { btn: btns[i], idx: i };
  }
  return null;
}

// Find COPY_CODE button and its index
function getCouponButton(t: Template): { btn: TemplateButton; idx: number } | null {
  const btns = getComp(t, "BUTTONS")?.buttons ?? [];
  for (let i = 0; i < btns.length; i++) {
    if (btns[i].type === "COPY_CODE") return { btn: btns[i], idx: i };
  }
  return null;
}

const CAT_COLOR: Record<string, string> = {
  MARKETING: "bg-purple-50 text-purple-600 border-purple-100",
  UTILITY: "bg-blue-50 text-blue-600 border-blue-100",
  AUTHENTICATION: "bg-orange-50 text-orange-600 border-orange-100",
};

const inputCls = "w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-ink focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20";

// ── WhatsApp preview ───────────────────────────────────────────────────────

function useWaProfile() {
  const [profile, setProfile] = useState<{ name: string; picture: string | null }>({ name: "", picture: null });
  useEffect(() => {
    fetch("/api/wa/profile").then(r => r.json()).then(j => {
      if (j.ok) setProfile({ name: j.name, picture: j.picture });
    }).catch(() => {});
  }, []);
  return profile;
}

function WAPreview({ template, imageUrl }: { template: Template; imageUrl?: string }) {
  const profile = useWaProfile();
  const header = getComp(template, "HEADER");
  const body = getComp(template, "BODY");
  const footer = getComp(template, "FOOTER");
  const buttons = getComp(template, "BUTTONS")?.buttons ?? [];
  const [time, setTime] = useState("12:00 AM");
  useEffect(() => { setTime(new Date().toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" })); }, []);

  return (
    <div className="overflow-hidden rounded-2xl bg-[#ECE5DD]">
      {/* WA-style header bar */}
      <div className="flex items-center gap-2 bg-[#075E54] px-3 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={profile.picture ?? "/uploads/logo.png"} alt={profile.name} className="h-7 w-7 rounded-full object-cover bg-white ring-2 ring-white/40" />
        <div>
          <p className="text-[10px] font-semibold text-white leading-tight">{profile.name}</p>
          <p className="text-[8px] text-white/60">Business account</p>
        </div>
      </div>
      <div className="p-3">
      <div className="overflow-hidden rounded-xl rounded-tl-sm bg-white ring-1 ring-black/5">
        {header?.format === "IMAGE" && (
          imageUrl
            ? <img src={imageUrl} alt="header" className="w-full max-h-40 object-cover" /> // eslint-disable-line @next/next/no-img-element
            : <div className="flex h-24 flex-col items-center justify-center gap-1.5 bg-gray-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <p className="text-[10px] text-gray-400">Image header</p>
              </div>
        )}
        {(header?.format === "VIDEO" || header?.format === "DOCUMENT") && (
          <div className="flex h-24 flex-col items-center justify-center gap-1.5 bg-gray-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            <p className="text-[10px] text-gray-400">{header.format.charAt(0) + header.format.slice(1).toLowerCase()} header</p>
          </div>
        )}
        {header?.format === "TEXT" && header.text && (
          <div className="bg-[#128C7E] px-3 py-2.5">
            <p className="text-sm font-semibold text-white">{header.text}</p>
          </div>
        )}
        <div className="px-3 py-2.5">
          {body?.text
            ? <p className="whitespace-pre-wrap text-sm text-gray-800">{body.text}</p>
            : <p className="text-sm italic text-gray-400">No body text</p>}
          {footer?.text && <p className="mt-2 text-xs text-gray-400">{footer.text}</p>}
          <p className="mt-1.5 text-right text-[10px] text-gray-400">{time} ✓✓</p>
        </div>
        {buttons.length > 0 && (
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {buttons.map((b, i) => (
              <p key={i} className="px-3 py-2 text-center text-sm font-semibold text-[#128C7E]">{b.text}</p>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

function TemplatesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const customerParam = searchParams.get("customers") ?? "";
  const preselected = customerParam ? customerParam.split(",").filter(Boolean) : [];

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Template | null>(null);
  const [sending, setSending]         = useState(false);
  const [result, setResult]           = useState<CampaignResult | null>(null);
  const [search, setSearch]           = useState("");
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt]   = useState("");
  const [scheduling, setScheduling]     = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);

  // Per-campaign inputs
  const [imageUrl, setImageUrl] = useState("");
  const [extraBodyVars, setExtraBodyVars] = useState<string[]>([]); // values for {{2}}, {{3}} ...
  const [urlSuffix, setUrlSuffix] = useState("");
  const [couponCode, setCouponCode] = useState("");

  useEffect(() => {
    fetch("/api/bot/templates")
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Failed");
        const list: Template[] = json.data;
        setTemplates(list);
        // Restore template selection if user just came back from /customers
        const savedId = sessionStorage.getItem("wa_selected_template");
        if (savedId && preselected.length > 0) {
          const match = list.find((t) => t.id === savedId);
          if (match) setSelected(match);
          sessionStorage.removeItem("wa_selected_template");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTemplate(t: Template) {
    setSelected((p) => p?.id === t.id ? null : t);
    setImageUrl("");
    setExtraBodyVars([]);
    setUrlSuffix("");
    setCouponCode("");
    setResult(null);
    setError(null);
    setScheduleSuccess(null);
    setScheduleMode(false);
    setScheduledAt("");
  }

  async function sendCampaign() {
    if (!selected || preselected.length === 0) return;
    if (hasImageHeader(selected) && !imageUrl.trim()) {
      setError("Please paste a public image URL for the header.");
      return;
    }
    const dynUrl = getDynamicUrlButton(selected);
    if (dynUrl && !urlSuffix.trim()) {
      setError(`Please fill in the URL for button "${dynUrl.btn.text}".`);
      return;
    }
    const coupon = getCouponButton(selected);
    if (coupon && !couponCode.trim()) {
      setError(`Please fill in the coupon code for button "${coupon.btn.text}".`);
      return;
    }

    setSending(true); setResult(null); setError(null);
    try {
      const bv = countBodyVars(selected);
      const campaignName = `${selected.name} — ${new Date().toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}`;
      const res = await fetch("/api/bot/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customers: preselected,
          templateName: selected.name,
          templateLanguage: selected.language,
          campaignName,
          // Image header
          imageUrl: hasImageHeader(selected) ? imageUrl.trim() : undefined,
          headerFormat: getComp(selected, "HEADER")?.format,
          // Body variables
          bodyVarCount: bv,
          // extraBodyVars covers {{2}}, {{3}} etc — {{1}} is auto-filled with customer name
          extraBodyVars: extraBodyVars.map((v) => v.trim()),
          // Dynamic URL button
          urlSuffix: dynUrl ? urlSuffix.trim() : undefined,
          urlButtonIndex: dynUrl?.idx,
          // Coupon code button
          couponCode: coupon ? couponCode.trim() : undefined,
          couponButtonIndex: coupon?.idx,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setResult(json.data);
      // Redirect to broadcast detail if we have an ID, otherwise list
      const dest = json.data?.broadcastId ? `/wa/campaigns/${json.data.broadcastId}` : "/wa/campaigns";
      setTimeout(() => router.push(dest), 1800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally { setSending(false); }
  }

  async function scheduleCampaign() {
    if (!selected || preselected.length === 0) return;
    if (!scheduledAt) { setError("Please pick a date and time to schedule."); return; }
    if (new Date(scheduledAt) <= new Date()) { setError("Schedule time must be in the future."); return; }
    if (hasImageHeader(selected) && !imageUrl.trim()) { setError("Please paste a public image URL for the header."); return; }
    const dynUrl = getDynamicUrlButton(selected);
    if (dynUrl && !urlSuffix.trim()) { setError(`Please fill in the URL for button "${dynUrl.btn.text}".`); return; }
    const coupon = getCouponButton(selected);
    if (coupon && !couponCode.trim()) { setError(`Please fill in the coupon code for button "${coupon.btn.text}".`); return; }

    setScheduling(true); setError(null); setScheduleSuccess(null);
    try {
      const bv  = countBodyVars(selected);
      const res = await fetch("/api/bot/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customers:        preselected,
          templateName:     selected.name,
          templateLanguage: selected.language,
          sendAt:           new Date(scheduledAt).toISOString(),
          imageUrl:         hasImageHeader(selected) ? imageUrl.trim() : undefined,
          headerFormat:     getComp(selected, "HEADER")?.format,
          bodyVarCount:     bv,
          extraBodyVars:    extraBodyVars.map((v) => v.trim()),
          urlSuffix:        dynUrl ? urlSuffix.trim() : undefined,
          urlButtonIndex:   dynUrl?.idx,
          couponCode:       coupon ? couponCode.trim() : undefined,
          couponButtonIndex:coupon?.idx,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const when = new Date(scheduledAt).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" });
      setScheduleSuccess(`Campaign scheduled for ${when} — ${preselected.length} recipient${preselected.length !== 1 ? "s" : ""}.`);
      setScheduleMode(false);
      setScheduledAt("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to schedule");
    } finally { setScheduling(false); }
  }

  const filtered = templates.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase()),
  );

  // Derived from selected template
  const bvCount = selected ? countBodyVars(selected) : 0;
  // Extra vars = {{2}} onwards ({{1}} is auto customer name)
  const extraVarCount = bvCount > 1 ? bvCount - 1 : 0;
  const dynUrl = selected ? getDynamicUrlButton(selected) : null;
  const coupon = selected ? getCouponButton(selected) : null;
  const hasAnyInput = selected && (hasImageHeader(selected) || extraVarCount > 0 || !!dynUrl || !!coupon);

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="px-6 py-5 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">Send Campaign</h1>
            <p className="mt-0.5 text-sm text-ink-muted">Pick an approved template and send it to your selected customers.</p>
          </div>
          {preselected.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 px-4 py-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#25D366] text-xs font-bold text-white">{preselected.length}</div>
              <span className="text-sm font-medium text-[#075E54]">{preselected.length} customer{preselected.length !== 1 ? "s" : ""} selected</span>
              <button onClick={() => { if (selected) sessionStorage.setItem("wa_selected_template", selected.id); router.push("/customers"); }} className="ml-2 text-xs text-[#075E54]/60 hover:text-[#075E54] underline">Change</button>
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      <div className="px-6 lg:px-8">
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>{error}</span>
          </div>
        )}
        {result && (
          <div className={["mt-4 rounded-xl border px-4 py-3", result.failed === 0 ? "border-success/30 bg-success/5" : "border-amber-200 bg-amber-50"].join(" ")}>
            <div className="flex items-center gap-3">
              {result.sent > 0 && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M20 6L9 17l-5-5"/></svg>
                  {result.sent} sent
                </span>
              )}
              {result.failed > 0 && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-danger">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  {result.failed} failed
                </span>
              )}
            </div>
            {result.results.filter((r) => r.error).map((r, i) => (
              <p key={i} className="mt-1.5 text-xs text-ink-muted">{r.wa_id}: {r.error}</p>
            ))}
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col gap-0 lg:flex-row lg:divide-x lg:divide-rule">

        {/* Left: template list */}
        <div className="flex-1 min-w-0 px-6 py-6 lg:px-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="relative flex-1">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="search" placeholder="Search templates…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-rule bg-white py-2.5 pl-9 pr-4 text-sm text-ink focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20" />
            </div>
            <span className="shrink-0 text-xs text-ink-muted">{filtered.length} template{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {loading ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-cream/60" />
            )) : filtered.length === 0 ? (
              <div className="col-span-2 rounded-2xl border border-dashed border-rule bg-white py-14 text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 h-8 w-8 text-ink-muted/40"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                <p className="text-sm font-medium text-ink">No approved templates</p>
                <p className="mt-1 text-xs text-ink-muted">Go to Manage Templates to create one.</p>
                <button onClick={() => router.push("/wa/manage")} className="mt-3 rounded-xl border border-rule px-4 py-1.5 text-xs font-medium text-ink hover:bg-cream/50 transition">
                  Manage Templates →
                </button>
              </div>
            ) : filtered.map((t) => {
              const isActive = selected?.id === t.id;
              const body = getComp(t, "BODY");
              const needsImg = hasImageHeader(t);
              const bv = countBodyVars(t);
              const btnCount = getComp(t, "BUTTONS")?.buttons?.length ?? 0;
              const catColor: Record<string, string> = {
                MARKETING: "#a855f7",
                UTILITY: "#3b82f6",
                AUTHENTICATION: "#f59e0b",
              };
              const accent = catColor[t.category] ?? "#6b7280";
              return (
                <button key={t.id} onClick={() => selectTemplate(t)}
                  className={[
                    "group relative w-full rounded-2xl border text-left transition-all duration-150 overflow-hidden",
                    isActive
                      ? "border-[#25D366] bg-white shadow-[0_0_0_2px_rgba(37,211,102,0.25)]"
                      : "border-rule bg-white hover:border-[#25D366]/40 hover:shadow-sm",
                  ].join(" ")}
                >
                  {/* Accent bar */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ backgroundColor: isActive ? "#25D366" : accent + "55" }} />

                  <div className="pl-4 pr-4 pt-3.5 pb-3.5">
                    {/* Top row: name + selected check */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Header type icon */}
                        {needsImg ? (
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                          </span>
                        ) : (
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-muted">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          </span>
                        )}
                        <p className="text-sm font-semibold text-ink truncate">{t.name}</p>
                      </div>
                      {/* Selected indicator */}
                      <div className={["flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all", isActive ? "border-[#25D366] bg-[#25D366]" : "border-rule group-hover:border-[#25D366]/40"].join(" ")}>
                        {isActive && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M20 6L9 17l-5-5"/></svg>
                        )}
                      </div>
                    </div>

                    {/* Body preview */}
                    <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted mb-3">
                      {body?.text?.slice(0, 100) ?? "No body text"}
                    </p>

                    {/* Footer: tags */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: accent, borderColor: accent + "40", backgroundColor: accent + "0d" }}>
                        {t.category.toLowerCase()}
                      </span>
                      {bv > 0 && (
                        <span className="rounded-md bg-amber-50 border border-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                          {bv} var{bv !== 1 ? "s" : ""}
                        </span>
                      )}
                      {btnCount > 0 && (
                        <span className="rounded-md bg-canvas border border-rule px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                          {btnCount} btn{btnCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: preview + inputs + send */}
        <div className="w-full shrink-0 lg:w-[380px]">
          <div className="sticky top-[57px] px-6 pt-6 pb-6 lg:px-8 -mt-6">
            {selected ? (
              <div className="space-y-4">
                {/* Preview */}
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">Preview</p>
                  <WAPreview template={selected} imageUrl={imageUrl || undefined} />
                </div>

                {/* ── Inputs section ── */}
                {hasAnyInput ? (
                  <div className="rounded-2xl border border-rule bg-white overflow-hidden">
                    <div className="border-b border-rule bg-canvas px-4 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Campaign details</p>
                    </div>
                  <div className="space-y-4 p-4">

                    {/* Image URL */}
                    {hasImageHeader(selected) && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-ink">Header Image URL <span className="text-danger">*</span></label>
                        <input type="url" value={imageUrl} placeholder="https://example.com/images/offer.jpg"
                          onChange={(e) => setImageUrl(e.target.value)} className={inputCls} />
                        <p className="mt-1 text-[11px] text-ink-muted">Direct JPG/PNG link from your website.</p>
                      </div>
                    )}

                    {/* {{1}} = customer name — automatic, shown as info only */}
                    {bvCount >= 1 && (
                      <div className="flex items-center gap-2.5 rounded-lg border border-[#25D366]/30 bg-[#25D366]/5 px-3 py-2.5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <div>
                          <p className="text-xs font-medium text-[#075E54]">&#123;&#123;1&#125;&#125; = Customer name — auto filled</p>
                          <p className="text-[11px] text-[#075E54]/70">Each customer receives their own name from your database.</p>
                        </div>
                      </div>
                    )}

                    {/* Extra body vars {{2}}, {{3}} etc */}
                    {extraVarCount > 0 && Array.from({ length: extraVarCount }, (_, i) => (
                      <div key={i}>
                        <label className="mb-1 block text-xs font-medium text-ink">&#123;&#123;{i + 2}&#125;&#125; — body variable</label>
                        <input type="text"
                          value={extraBodyVars[i] ?? ""}
                          placeholder={`Value for {{${i + 2}}}`}
                          onChange={(e) => {
                            const next = [...extraBodyVars];
                            next[i] = e.target.value;
                            setExtraBodyVars(next);
                          }}
                          className={inputCls}
                        />
                      </div>
                    ))}

                    {/* Dynamic URL button */}
                    {dynUrl && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-ink">
                          Button &ldquo;{dynUrl.btn.text}&rdquo; — URL suffix <span className="text-danger">*</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 rounded-l-lg border border-r-0 border-rule bg-canvas px-3 py-2 text-xs text-ink-muted truncate max-w-[160px]">
                            {dynUrl.btn.url?.replace(/\{\{1\}\}.*$/, "")}
                          </span>
                          <input type="text" value={urlSuffix} placeholder="e.g. summer-sale"
                            onChange={(e) => setUrlSuffix(e.target.value.replace(/^\/+/, ""))}
                            className="flex-1 rounded-r-lg border border-rule bg-white px-3 py-2 text-sm text-ink focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20" />
                        </div>
                      </div>
                    )}

                    {/* Coupon code button */}
                    {coupon && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-ink">
                          Button &ldquo;{coupon.btn.text}&rdquo; — Coupon code <span className="text-danger">*</span>
                        </label>
                        <input type="text" value={couponCode} placeholder="e.g. SAVE20"
                          onChange={(e) => setCouponCode(e.target.value)} className={inputCls} />
                      </div>
                    )}
                  </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 px-4 py-3">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                    <span className="text-sm text-[#075E54]">Template sends exactly as approved — no extra input needed.</span>
                  </div>
                )}

                {/* Send / Schedule buttons */}
                <div className="space-y-2 pt-1">
                  {preselected.length === 0 ? (
                    <button
                      onClick={() => {
                        if (selected) sessionStorage.setItem("wa_selected_template", selected.id);
                        router.push("/customers");
                      }}
                      className="w-full rounded-xl border-2 border-dashed border-[#25D366]/40 py-3.5 text-sm font-medium text-[#075E54]/70 transition hover:border-[#25D366] hover:text-[#075E54] hover:bg-[#25D366]/5">
                      ← Select customers first
                    </button>
                  ) : scheduleSuccess ? (
                    /* ── Scheduled confirmation state ── */
                    <div className="rounded-xl border border-[#075E54]/20 bg-[#075E54]/5 p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#075E54]/10">
                          <svg viewBox="0 0 24 24" fill="none" stroke="#075E54" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M20 6L9 17l-5-5"/></svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#075E54]">Campaign scheduled</p>
                          <p className="mt-0.5 text-xs text-[#075E54]/70">{scheduleSuccess}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => router.push("/wa/campaigns?tab=scheduled")}
                        className="w-full rounded-xl border border-[#075E54]/30 bg-white py-2.5 text-sm font-semibold text-[#075E54] transition hover:bg-[#075E54]/5"
                      >
                        <span className="flex items-center justify-center gap-2">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                          </svg>
                          View scheduled campaigns
                        </span>
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Send now */}
                      {!scheduleMode && (
                        <button onClick={sendCampaign} disabled={sending || scheduling}
                          className="relative w-full overflow-hidden rounded-xl bg-[#25D366] py-3.5 text-sm font-semibold text-white transition hover:bg-[#128C7E] disabled:opacity-60 active:scale-[0.98]">
                          {sending ? (
                            <span className="flex items-center justify-center gap-2">
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                              Sending to {preselected.length} customer{preselected.length !== 1 ? "s" : ""}…
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                              Send now · {preselected.length} recipient{preselected.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </button>
                      )}

                      {/* Schedule toggle */}
                      <button
                        onClick={() => { setScheduleMode((m) => !m); setError(null); setScheduledAt(""); }}
                        disabled={sending || scheduling}
                        className={[
                          "w-full rounded-xl border py-3 text-sm font-semibold transition",
                          scheduleMode
                            ? "border-[#075E54]/30 bg-[#075E54]/5 text-[#075E54]"
                            : "border-rule bg-canvas text-ink-muted hover:border-[#075E54]/30 hover:text-[#075E54]",
                        ].join(" ")}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                          </svg>
                          {scheduleMode ? "Cancel scheduling" : "Schedule for later"}
                        </span>
                      </button>

                      {/* Schedule datetime picker */}
                      {scheduleMode && (
                        <div className="space-y-2 rounded-xl border border-[#075E54]/20 bg-[#075E54]/5 p-4">
                          <label className="block text-xs font-semibold text-[#075E54]">Send date &amp; time</label>
                          <input
                            type="datetime-local"
                            value={scheduledAt}
                            min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                            onChange={(e) => setScheduledAt(e.target.value)}
                            className="w-full rounded-lg border border-[#075E54]/20 bg-white px-3 py-2 text-sm text-ink focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20"
                          />
                          <button
                            onClick={scheduleCampaign}
                            disabled={scheduling || !scheduledAt}
                            className="w-full rounded-xl bg-[#075E54] py-3 text-sm font-semibold text-white transition hover:bg-[#054d44] disabled:opacity-60"
                          >
                            {scheduling ? (
                              <span className="flex items-center justify-center gap-2">
                                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                                Scheduling…
                              </span>
                            ) : (
                              <span className="flex items-center justify-center gap-2">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>
                                </svg>
                                Confirm Schedule · {preselected.length} recipient{preselected.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#25D366]/10">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                </div>
                <p className="text-sm font-medium text-ink">Select a template</p>
                <p className="mt-1 text-xs text-ink-muted">Click any template on the left to preview and send.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center text-sm text-ink-muted">Loading templates…</div>}>
      <TemplatesContent />
    </Suspense>
  );
}
