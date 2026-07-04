"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────

type CampaignResult = { wa_id: string; status: string; error?: string };

type CampaignLog = {
  id: number;
  template_name: string;
  template_language: string;
  total: number;
  sent: number;
  failed: number;
  results: CampaignResult[];
  created_at: string;
};

type Stats = {
  total_campaigns: number;
  total_messages: number;
  total_sent: number;
  total_failed: number;
};

type ChartDay = { day: string; sent: number; failed: number; campaigns: number };

type ScheduledCampaign = {
  id: number;
  template_name: string;
  template_language: string;
  customers: string[];
  send_at: string;
  status: string;
  error?: string;
  created_by?: string;
  created_at: string;
};

// ── Date presets ──────────────────────────────────────────────────────────

const PRESETS = [
  { label: "All time",    value: "all" },
  { label: "Today",       value: "today" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days",value: "30d" },
  { label: "This Month",  value: "month" },
];

function presetToRange(value: string): { from: string | null; to: string | null } {
  const now   = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const fmt   = (d: Date) => d.toISOString();

  switch (value) {
    case "today": {
      const end = new Date(today); end.setUTCDate(end.getUTCDate() + 1);
      return { from: fmt(today), to: fmt(end) };
    }
    case "7d": {
      const start = new Date(today); start.setUTCDate(start.getUTCDate() - 6);
      const end   = new Date(today); end.setUTCDate(end.getUTCDate() + 1);
      return { from: fmt(start), to: fmt(end) };
    }
    case "30d": {
      const start = new Date(today); start.setUTCDate(start.getUTCDate() - 29);
      const end   = new Date(today); end.setUTCDate(end.getUTCDate() + 1);
      return { from: fmt(start), to: fmt(end) };
    }
    case "month": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end   = new Date(today); end.setUTCDate(end.getUTCDate() + 1);
      return { from: fmt(start), to: fmt(end) };
    }
    default:
      return { from: null, to: null };
  }
}

// ── Delivery trend chart ──────────────────────────────────────────────────

function TrendChart({ data }: { data: ChartDay[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-sm text-ink-muted">No data for this period</p>
      </div>
    );
  }

  const W      = 600;
  const H      = 120;
  const PAD    = 8; // left/right padding
  const colW   = (W - PAD * 2) / data.length;
  const BAR_W  = Math.min(52, Math.max(10, colW * 0.55));
  const maxVal = Math.max(...data.map((d) => d.sent + d.failed), 1);
  const showEvery = data.length <= 14 ? 1 : Math.ceil(data.length / 10);

  return (
    <svg viewBox={`0 0 ${W} ${H + 32}`} xmlns="http://www.w3.org/2000/svg" className="w-full">
      {data.map((d, i) => {
        const total   = d.sent + d.failed;
        const barH    = total === 0 ? 3 : Math.max(6, (total / maxVal) * H);
        const sentH   = total === 0 ? 0 : Math.round((d.sent / total) * barH);
        const failedH = barH - sentH;
        const cx      = PAD + i * colW + colW / 2;
        const x       = cx - BAR_W / 2;
        const showLabel = i % showEvery === 0 || i === data.length - 1;
        const label   = new Date(d.day).toLocaleDateString("en-AE", {
          day: "numeric", month: "short",
        });

        return (
          <g key={i}>
            {/* Background track */}
            <rect x={x} y={0} width={BAR_W} height={H} rx={6} fill="#f4f5f7" />
            {/* Failed (top of bar) */}
            {failedH > 0 && (
              <rect x={x} y={H - barH} width={BAR_W} height={failedH}
                rx={sentH === 0 ? 6 : 0}
                style={{ borderTopLeftRadius: 6, borderTopRightRadius: 6 }}
                fill="#fca5a5" />
            )}
            {/* Sent (bottom of bar) */}
            {sentH > 0 && (
              <rect x={x} y={H - sentH} width={BAR_W} height={sentH}
                rx={failedH === 0 ? 6 : 0}
                fill="#4ade80" />
            )}
            {/* Total label above bar */}
            {total > 0 && BAR_W >= 20 && (
              <text x={cx} y={H - barH - 5} textAnchor="middle"
                fontSize={9} fontWeight={700} fill="var(--color-brand)" opacity={0.7}>
                {total}
              </text>
            )}
            {/* Date label below */}
            {showLabel && (
              <text x={cx} y={H + 20} textAnchor="middle"
                fontSize={10} fontWeight={500} fill="#9e7b6d">
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Delivery bar ──────────────────────────────────────────────────────────

function DeliveryBar({ sent, failed, total }: { sent: number; failed: number; total: number }) {
  const sentPct = total > 0 ? (sent / total) * 100 : 0;
  const failPct = total > 0 ? (failed / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f4f5f7]">
        <div className="flex h-full">
          <div className="bg-[#4ade80] transition-all" style={{ width: `${sentPct}%` }} />
          <div className="bg-[#fca5a5] transition-all" style={{ width: `${failPct}%` }} />
        </div>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-ink-muted">{sent}/{total}</span>
    </div>
  );
}

// ── Results drawer ────────────────────────────────────────────────────────

function ResultsDrawer({ log, onClose }: { log: CampaignLog; onClose: () => void }) {
  const failed = log.results.filter((r) => r.status === "failed");
  const sent   = log.results.filter((r) => r.status === "sent");
  const rate   = log.total > 0 ? Math.round((log.sent / log.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative z-10 ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rule px-5 py-4">
          <div>
            <p className="font-semibold text-ink">{log.template_name}</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {new Date(log.created_at).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
          <button onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-rule text-ink-muted hover:bg-canvas transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 divide-x divide-rule border-b border-rule bg-canvas">
          {[
            { label: "Total",     value: log.total,  color: "text-ink" },
            { label: "Sent",      value: log.sent,   color: "text-[#16a34a]" },
            { label: "Failed",    value: log.failed, color: log.failed > 0 ? "text-[#dc2626]" : "text-ink-muted" },
            { label: "Rate",      value: `${rate}%`, color: rate === 100 ? "text-[#16a34a]" : rate >= 80 ? "text-amber-600" : "text-[#dc2626]" },
          ].map((s) => (
            <div key={s.label} className="py-4 text-center">
              <p className={["text-xl font-bold tabular-nums", s.color].join(" ")}>{s.value}</p>
              <p className="mt-0.5 text-[11px] font-medium text-ink-muted">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto">
          {failed.length > 0 && (
            <div>
              <div className="sticky top-0 bg-white border-b border-rule px-5 py-2.5 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                <p className="text-xs font-bold uppercase tracking-widest text-[#dc2626]">Failed ({failed.length})</p>
              </div>
              {failed.map((r, i) => (
                <div key={i} className="flex items-start gap-3 border-b border-rule px-5 py-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 mt-0.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">+{r.wa_id}</p>
                    {r.error && <p className="mt-0.5 text-xs text-ink-muted">{r.error}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {sent.length > 0 && (
            <div>
              <div className="sticky top-0 bg-white border-b border-rule px-5 py-2.5 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#4ade80]" />
                <p className="text-xs font-bold uppercase tracking-widest text-[#16a34a]">Delivered ({sent.length})</p>
              </div>
              {sent.map((r, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-rule px-5 py-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  </div>
                  <p className="text-sm text-ink">+{r.wa_id}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-rule bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">{label}</p>
          <p className={["mt-2 text-3xl font-bold tabular-nums", accent ?? "text-ink"].join(" ")}>{value}</p>
          {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas">
          {icon}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  return <Suspense fallback={null}><CampaignsInner /></Suspense>;
}

function CampaignsInner() {
  const router     = useRouter();
  const searchParams = useSearchParams();

  const [logs,     setLogs]     = useState<CampaignLog[]>([]);
  const [stats,    setStats]    = useState<Stats>({ total_campaigns: 0, total_messages: 0, total_sent: 0, total_failed: 0 });
  const [chart,    setChart]    = useState<ChartDay[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [page,     setPage]     = useState(1);
  const [pages,    setPages]    = useState(1);
  const [total,    setTotal]    = useState(0);
  const [active,     setActive]     = useState<CampaignLog | null>(null);
  const [deleting,   setDeleting]   = useState<number | null>(null);
  const [preset,     setPreset]     = useState("all");
  const [search,     setSearch]     = useState("");
  const [tab,        setTab]        = useState<"history" | "scheduled">(
    searchParams.get("tab") === "scheduled" ? "scheduled" : "history"
  );
  const [scheduled,  setScheduled]  = useState<ScheduledCampaign[]>([]);
  const [schLoading,  setSchLoading]  = useState(false);
  const [cancelling,  setCancelling]  = useState<number | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((p = 1, currentPreset = preset, currentSearch = search) => {
    setLoading(true);
    const { from, to } = presetToRange(currentPreset);
    const params = new URLSearchParams({ page: String(p) });
    if (currentSearch) params.set("search", currentSearch);
    if (from) params.set("from", from);
    if (to)   params.set("to", to);

    fetch(`/api/bot/campaigns?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Failed");
        setLogs(json.data.logs     ?? []);
        setStats(json.data.stats   ?? { total_campaigns: 0, total_messages: 0, total_sent: 0, total_failed: 0 });
        setChart(json.data.chart   ?? []);
        setTotal(json.data.total   ?? 0);
        setPages(json.data.pages   ?? 1);
        setPage(p);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [preset, search]);

  useEffect(() => { load(1); }, [load]);

  const loadScheduled = useCallback(() => {
    setSchLoading(true);
    fetch("/api/bot/scheduled?status=pending")
      .then((r) => r.json())
      .then((json) => { if (json.ok) setScheduled(json.data.scheduled ?? []); })
      .catch(() => {})
      .finally(() => setSchLoading(false));
  }, []);

  useEffect(() => { if (tab === "scheduled") loadScheduled(); }, [tab, loadScheduled]);

  async function cancelScheduled(id: number) {
    if (!confirm("Cancel this scheduled campaign?")) return;
    setCancelling(id);
    try {
      const res  = await fetch("/api/bot/scheduled", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setScheduled((prev) => prev.filter((s) => s.id !== id));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setCancelling(null); }
  }

  function handlePreset(v: string) {
    setPreset(v);
    load(1, v, search);
  }

  function handleSearch(v: string) {
    setSearch(v);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => load(1, preset, v), 400);
  }

  async function deleteLog(id: number) {
    if (!confirm("Delete this campaign log?")) return;
    setDeleting(id);
    try {
      const res  = await fetch("/api/bot/campaigns", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      load(page);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setDeleting(null); }
  }

  const successRate = stats.total_messages > 0
    ? Math.round((stats.total_sent / stats.total_messages) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-canvas">
      {active && <ResultsDrawer log={active} onClose={() => setActive(null)} />}

      {/* ── Page header ── */}
      <div className="border-b border-rule bg-white px-6 py-5 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-caramel">WhatsApp</p>
            <h1 className="mt-0.5 text-xl font-bold text-ink">Campaign Analytics</h1>
            <p className="mt-0.5 text-sm text-ink-muted">Track delivery rates and campaign performance.</p>
          </div>
          <button
            onClick={() => router.push("/wa/templates")}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#128C7E] transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Send Campaign
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1">
          {([
            { key: "history",   label: "History",   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
            { key: "scheduled", label: "Scheduled", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
                tab === t.key
                  ? "bg-brand text-white"
                  : "text-ink-muted hover:bg-canvas hover:text-ink",
              ].join(" ")}
            >
              {t.icon}
              {t.label}
              {t.key === "scheduled" && scheduled.length > 0 && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                  {scheduled.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scheduled tab ── */}
      {tab === "scheduled" && (
        <div className="px-6 py-6 lg:px-8">
          {schLoading ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white border border-rule" />)}
            </div>
          ) : scheduled.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rule bg-white py-20 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#075E54]/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="#075E54" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-ink">No scheduled campaigns</p>
              <p className="mt-1 text-xs text-ink-muted">Schedule a campaign from the Send Campaign page.</p>
              <button onClick={() => router.push("/wa/templates")}
                className="mt-4 rounded-xl bg-[#075E54] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#054d44] transition">
                Schedule a campaign
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {scheduled.map((s) => {
                const sendAt  = new Date(s.send_at);
                const isToday = sendAt.toDateString() === new Date().toDateString();
                const isDue   = sendAt <= new Date();
                const isSoon  = sendAt.getTime() - Date.now() < 3600_000;
                return (
                  <div key={s.id} className={["group flex items-center gap-4 rounded-2xl border bg-white px-5 py-4 transition", isDue ? "border-amber-200" : "border-rule hover:border-[#075E54]/30"].join(" ")}>
                    {/* Clock icon */}
                    <div className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", isDue ? "bg-amber-50" : isSoon ? "bg-amber-50" : "bg-[#075E54]/10"].join(" ")}>
                      <svg viewBox="0 0 24 24" fill="none" stroke={isDue || isSoon ? "#d97706" : "#075E54"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                      </svg>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-ink truncate">{s.template_name}</p>
                        <span className="rounded-full bg-canvas border border-rule px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{s.template_language}</span>
                        {isSoon && <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">Sending soon</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-muted">
                        <span className="flex items-center gap-1">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                          </svg>
                          {isToday ? "Today" : sendAt.toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}
                          {" at "}
                          {sendAt.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                          </svg>
                          {s.customers.length} recipient{s.customers.length !== 1 ? "s" : ""}
                        </span>
                        {s.created_by && <span>by {s.created_by}</span>}
                      </div>
                    </div>

                    {/* Cancel */}
                    <button
                      onClick={() => cancelScheduled(s.id)}
                      disabled={cancelling === s.id}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-500 opacity-0 transition group-hover:opacity-100 hover:bg-red-100 disabled:opacity-50"
                    >
                      {cancelling === s.id
                        ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M18 6L6 18M6 6l12 12"/></svg>}
                      Cancel
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── History + Analytics tab ── */}
      {tab === "history" && <div className="px-6 py-6 lg:px-8 space-y-6">

        {/* ── Filters ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by template name…"
              className="w-full rounded-xl border border-rule bg-white py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand/30 sm:w-64"
            />
          </div>

          {/* Date presets */}
          <div className="flex items-center gap-1 self-start rounded-xl border border-rule bg-white p-1 shadow-sm sm:self-auto">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePreset(p.value)}
                className={[
                  "rounded-[9px] px-3.5 py-2 text-sm font-semibold transition-all",
                  preset === p.value
                    ? "bg-brand text-white shadow-sm"
                    : "text-ink-muted hover:bg-canvas hover:text-ink",
                ].join(" ")}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            {error}
          </div>
        )}

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Campaigns"
            value={stats.total_campaigns.toLocaleString()}
            sub="In selected period"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-caramel)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>}
          />
          <StatCard
            label="Messages Sent"
            value={stats.total_sent.toLocaleString()}
            sub={`of ${stats.total_messages.toLocaleString()} total`}
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
            accent="text-[#16a34a]"
          />
          <StatCard
            label="Success Rate"
            value={`${successRate}%`}
            sub="Delivered vs total"
            icon={
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"
                stroke={successRate === 100 ? "#16a34a" : successRate >= 80 ? "#d97706" : "#dc2626"}>
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>
              </svg>
            }
            accent={successRate === 100 ? "text-[#16a34a]" : successRate >= 80 ? "text-amber-600" : "text-[#dc2626]"}
          />
          <StatCard
            label="Failed"
            value={stats.total_failed.toLocaleString()}
            sub="Delivery failures"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke={stats.total_failed > 0 ? "#dc2626" : "#9e7b6d"} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>}
            accent={stats.total_failed > 0 ? "text-[#dc2626]" : "text-ink-muted"}
          />
        </div>

        {/* ── Delivery trend chart ── */}
        {chart.length > 0 && (
          <div className="rounded-2xl border border-rule bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-ink">Delivery Trend</p>
                <p className="mt-0.5 text-xs text-ink-muted">Messages sent vs failed per day</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#4ade80]" /> Sent
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#fca5a5]" /> Failed
                </span>
              </div>
            </div>
            <TrendChart data={chart} />
          </div>
        )}

        {/* ── Campaign table ── */}
        <div className="rounded-2xl border border-rule bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-rule bg-canvas px-5 py-3.5">
            <div>
              <p className="text-sm font-bold text-ink">Campaign Logs</p>
              <p className="text-xs text-ink-muted">{total} campaign{total !== 1 ? "s" : ""} found</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-0 divide-y divide-rule">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-4 w-40 animate-pulse rounded bg-canvas" />
                  <div className="h-4 w-24 animate-pulse rounded bg-canvas" />
                  <div className="ml-auto h-3 w-32 animate-pulse rounded bg-canvas" />
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25D366]/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-ink">No campaigns found</p>
              <p className="mt-1 text-xs text-ink-muted">Try adjusting your filters or send a new campaign.</p>
              <button onClick={() => router.push("/wa/templates")}
                className="mt-4 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#128C7E] transition">
                Send first campaign
              </button>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule bg-canvas/50 text-left">
                    {["Template", "Sent on", "Delivery", "Rate", ""].map((h) => (
                      <th key={h} className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {logs.map((log) => {
                    const rate = log.total > 0 ? Math.round((log.sent / log.total) * 100) : 0;
                    return (
                      <tr key={log.id} className="group hover:bg-canvas/50 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-ink">{log.template_name}</p>
                          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-muted">{log.template_language}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm text-ink">
                            {new Date(log.created_at).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {new Date(log.created_at).toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </td>
                        <td className="px-5 py-4 min-w-[180px]">
                          <DeliveryBar sent={log.sent} failed={log.failed} total={log.total} />
                          <p className="mt-1 text-[11px] text-ink-muted">
                            {log.sent} delivered · {log.failed} failed · {log.total} total
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          {rate === 100 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 100%
                            </span>
                          ) : rate >= 80 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {rate}%
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> {rate}%
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setActive(log)}
                              className="flex items-center gap-1.5 rounded-lg border border-rule bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-canvas transition"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                              </svg>
                              Details
                            </button>
                            <button
                              onClick={() => deleteLog(log.id)}
                              disabled={deleting === log.id}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-400 hover:bg-red-100 disabled:opacity-50 transition"
                            >
                              {deleting === log.id
                                ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {pages > 1 && (
                <div className="flex items-center justify-between border-t border-rule px-5 py-3.5">
                  <p className="text-sm text-ink-muted">Showing {logs.length} of {total}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => load(page - 1)} disabled={page <= 1}
                      className="rounded-lg border border-rule bg-white px-3.5 py-2 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-40 transition">
                      Previous
                    </button>
                    <span className="px-2 text-sm text-ink-muted">Page {page} of {pages}</span>
                    <button onClick={() => load(page + 1)} disabled={page >= pages}
                      className="rounded-lg border border-rule bg-white px-3.5 py-2 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-40 transition">
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>}
    </div>
  );
}
