"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
// Note: useRef kept for search debounce in CampaignsPage
import { useRouter, useSearchParams } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────

type Broadcast = {
  id: string; name: string; templateName: string; templateLang: string;
  status: string; totalCount: number; sentCount: number;
  deliveredCount: number; readCount: number; failedCount: number; skippedCount: number;
  createdAt: string; completedAt: string | null;
  sentBy: { name: string } | null;
};

type Totals = {
  campaigns: number; recipients: number; sent: number;
  delivered: number; read: number; failed: number;
};

// ── Date presets ──────────────────────────────────────────────────────────

const PRESETS = [
  { label: "All time",    value: "all" },
  { label: "Today",       value: "today" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days",value: "30d" },
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
    default:
      return { from: null, to: null };
  }
}

// ── Stat card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, danger }: {
  label: string; value: string | number; sub?: string; danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">{label}</p>
      <p className={["mt-2 text-2xl font-bold tabular-nums tracking-tight leading-tight", danger ? "text-red-600" : "text-[#0f172a]"].join(" ")}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-[#64748b]">{sub}</p>}
    </div>
  );
}

// ── Delivery mini-bar ──────────────────────────────────────────────────────

function MiniBar({ delivered, read, total }: { delivered: number; read: number; total: number }) {
  const dPct = total > 0 ? (delivered / total) * 100 : 0;
  const rPct = total > 0 ? (read      / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-px flex-1 overflow-hidden rounded-full bg-[#e5e7eb]">
        <div className="flex h-full">
          <div className="bg-emerald-400 transition-all" style={{ width: `${dPct}%` }} />
          <div className="bg-violet-400 transition-all" style={{ width: `${rPct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── Scheduled tab ────────────────────────────────────────────────────────

type Scheduled = {
  id: number; template_name: string; template_language: string;
  customers: string[]; send_at: string; status: string;
  error: string | null; created_by: string | null; created_at: string;
};

function ScheduledTab() {
  const [rows,    setRows]    = useState<Scheduled[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const router = useRouter();

  function load() {
    setLoading(true);
    fetch("/api/bot/scheduled?status=pending")
      .then(r => r.json())
      .then(j => { if (j.ok) setRows(j.data.scheduled ?? []); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function cancel(id: number) {
    setCancelling(id);
    await fetch("/api/bot/scheduled", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setCancelling(null);
    load();
  }

  if (loading) return (
    <div className="rounded-xl border border-rule bg-white overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-rule px-5 py-4 last:border-0">
          <div className="h-4 w-40 animate-pulse rounded bg-canvas" />
          <div className="ml-auto h-4 w-24 animate-pulse rounded bg-canvas" />
        </div>
      ))}
    </div>
  );

  if (rows.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-rule bg-white py-20 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-canvas">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-ink-muted">
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>
        </svg>
      </div>
      <p className="text-sm font-semibold text-ink">No scheduled campaigns</p>
      <p className="mt-1 text-xs text-ink-muted">Use &ldquo;Schedule for later&rdquo; when sending a campaign.</p>
      <button onClick={() => router.push("/wa/templates")}
        className="mt-4 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition">
        Send a campaign
      </button>
    </div>
  );

  return (
    <div className="rounded-xl border border-rule bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-rule bg-canvas px-5 py-3.5">
        <div>
          <p className="text-sm font-bold text-ink">Scheduled Campaigns</p>
          <p className="text-xs text-ink-muted">{rows.length} pending</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-rule bg-white px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-ink hover:bg-canvas transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
          </svg>
          Refresh
        </button>
      </div>
      <div className="divide-y divide-rule">
        {rows.map((r) => {
          const sendAt = new Date(r.send_at);
          const isPast = sendAt <= new Date();
          return (
            <div key={r.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-ink-muted">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{r.template_name}</p>
                <p className="text-xs text-ink-muted">
                  {r.customers.length} recipient{r.customers.length !== 1 ? "s" : ""}
                  {r.created_by ? ` · by ${r.created_by}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={["text-sm font-semibold tabular-nums", isPast ? "text-amber-600" : "text-ink"].join(" ")}>
                  {sendAt.toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                <p className="text-xs text-ink-muted">
                  {sendAt.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" })}
                  {isPast ? " · overdue" : ""}
                </p>
              </div>
              <button
                onClick={() => cancel(r.id)}
                disabled={cancelling === r.id}
                className="shrink-0 rounded-lg border border-rule bg-white px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                {cancelling === r.id ? "…" : "Cancel"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────

function CampaignsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"history" | "scheduled">(
    searchParams.get("tab") === "scheduled" ? "scheduled" : "history"
  );

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [totals,     setTotals]     = useState<Totals>({ campaigns: 0, recipients: 0, sent: 0, delivered: 0, read: 0, failed: 0 });
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [pages,      setPages]      = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [preset,     setPreset]     = useState("all");
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((p = 1, q = search, pre = preset) => {
    setLoading(true);
    const { from, to } = presetToRange(pre);
    const params = new URLSearchParams({ page: String(p) });
    if (q)    params.set("search", q);
    if (from) params.set("from", from);
    if (to)   params.set("to", to);

    fetch(`/api/broadcasts?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Failed");
        setBroadcasts(json.data.broadcasts ?? []);
        setTotals(json.data.totals ?? { campaigns: 0, recipients: 0, sent: 0, delivered: 0, read: 0, failed: 0 });
        setTotal(json.data.total ?? 0);
        setPages(json.data.pages ?? 1);
        setPage(p);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, preset]);

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(v: string) {
    setSearch(v);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => load(1, v, preset), 400);
  }

  function handlePreset(v: string) {
    setPreset(v);
    load(1, search, v);
  }

  const delivRate = totals.recipients > 0 ? Math.round((totals.delivered / totals.recipients) * 100) : 0;
  const readRate  = totals.delivered  > 0 ? Math.round((totals.read      / totals.delivered)  * 100) : 0;

  return (
    <div className="min-h-screen bg-white">

      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-4 lg:px-8">

        {/* Left — tabs + search */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] p-0.5">
            {([
              { key: "history",   label: "History",   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> },
              { key: "scheduled", label: "Scheduled", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/></svg> },
            ] as const).map((t) => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={["flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-150",
                  activeTab === t.key ? "bg-white text-[#0f172a] shadow-sm shadow-black/8" : "text-[#64748b] hover:text-[#374151]",
                ].join(" ")}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {activeTab === "history" && (
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input type="text" value={search} onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search campaigns…"
                className="h-8 w-48 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] pl-8 pr-3 text-[13px] text-[#0f172a] placeholder:text-[#9ca3af] focus:bg-white focus:outline-none transition"
              />
            </div>
          )}
        </div>

        {/* Right — date presets + Send */}
        <div className="flex items-center gap-2">
          {activeTab === "history" && (
            <div className="flex items-center gap-0.5 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] p-0.5">
              {PRESETS.map((p) => (
                <button key={p.value} onClick={() => handlePreset(p.value)}
                  className={["rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-150",
                    preset === p.value ? "bg-white text-[#0f172a] shadow-sm shadow-black/8" : "text-[#64748b] hover:text-[#374151]",
                  ].join(" ")}>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => router.push("/wa/templates")}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#25D366] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1DA851]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Send
          </button>
        </div>
      </div>

      <div className="px-6 pb-8 lg:px-8 space-y-5 mt-4">

        {activeTab === "scheduled" && <ScheduledTab />}

        {activeTab === "history" && <>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Campaigns" value={totals.campaigns} />
          <StatCard label="Recipients" value={totals.recipients} />
          <StatCard label="Delivered" value={totals.delivered} sub={`${delivRate}% delivery rate`} />
          <StatCard label="Read" value={totals.read} sub={totals.delivered > 0 ? `${readRate}% of delivered` : undefined} />
          <StatCard label="Failed" value={totals.failed} danger={totals.failed > 0} sub={totals.failed > 0 ? `${totals.campaigns > 0 ? Math.round((totals.failed / totals.recipients) * 100) : 0}% failure rate` : undefined} />
        </div>



        {/* ── Table ── */}
        <div className="rounded-xl border border-rule bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-rule bg-canvas px-5 py-3.5">
            <div>
              <p className="text-sm font-bold text-ink">All Campaigns</p>
              <p className="text-xs text-ink-muted">{total} campaign{total !== 1 ? "s" : ""}</p>
            </div>
            <button onClick={() => load(page)} className="flex items-center gap-1.5 rounded-lg border border-rule bg-white px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-ink hover:bg-canvas transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
              </svg>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="divide-y divide-rule">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-4 w-44 animate-pulse rounded bg-canvas" />
                  <div className="ml-auto flex gap-6">
                    <div className="h-4 w-12 animate-pulse rounded bg-canvas" />
                    <div className="h-4 w-12 animate-pulse rounded bg-canvas" />
                    <div className="h-4 w-12 animate-pulse rounded bg-canvas" />
                  </div>
                </div>
              ))}
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-ink">No campaigns yet</p>
              <p className="mt-1 text-xs text-ink-muted max-w-xs">Campaigns sent via the bot will appear here with full delivery tracking.</p>
              <button onClick={() => router.push("/wa/templates")}
                className="mt-4 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition">
                Send first campaign
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-rule bg-[#f6f8fa] text-left">
                      {["Campaign", "Template", "Date", "Recipients", "Delivered", "Read", "Failed"].map((h) => (
                        <th key={h} className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {broadcasts.map((b) => {
                      const delivPct = b.totalCount > 0 ? Math.round((b.deliveredCount / b.totalCount) * 100) : 0;
                      const readPct  = b.totalCount > 0 ? Math.round((b.readCount      / b.totalCount) * 100) : 0;
                      return (
                        <tr key={b.id} onClick={() => router.push(`/wa/campaigns/${b.id}`)}
                          className="cursor-pointer hover:bg-[#f6f8fa] transition-colors">
                          <td className="px-5 py-3">
                            <p className="font-semibold text-ink">{b.name}</p>
                            {b.sentBy && <p className="mt-0.5 text-[11px] text-ink-muted">by {b.sentBy.name}</p>}
                            <span className={[
                              "mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              b.status === "COMPLETED" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : b.status === "FAILED" ? "border-red-200 bg-red-50 text-red-600"
                                : "border-amber-200 bg-amber-50 text-amber-700",
                            ].join(" ")}>{b.status}</span>
                          </td>
                          <td className="px-5 py-3">
                            <p className="text-ink">{b.templateName}</p>
                            <span className="text-[10px] uppercase tracking-wide text-ink-muted font-semibold">{b.templateLang}</span>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <p className="text-ink">{new Date(b.createdAt).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}</p>
                            <p className="text-xs text-ink-muted">{new Date(b.createdAt).toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" })}</p>
                          </td>
                          <td className="px-5 py-4 tabular-nums font-semibold text-ink">{b.totalCount.toLocaleString()}</td>
                          <td className="px-5 py-3">
                            <p className="font-semibold text-emerald-700 tabular-nums">{b.deliveredCount.toLocaleString()}</p>
                            <p className="text-xs text-ink-muted">{delivPct}%</p>
                          </td>
                          <td className="px-5 py-3">
                            <p className="font-semibold text-violet-700 tabular-nums">{b.readCount.toLocaleString()}</p>
                            <p className="text-xs text-ink-muted">{readPct}%</p>
                          </td>
                          <td className="px-5 py-3">
                            <p className={`font-semibold tabular-nums ${b.failedCount > 0 ? "text-red-600" : "text-ink-muted"}`}>
                              {b.failedCount.toLocaleString()}
                            </p>
                            {b.skippedCount > 0 && (
                              <p className="text-xs font-medium text-amber-600 tabular-nums">
                                +{b.skippedCount} unsub
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {pages > 1 && (
                <div className="flex items-center justify-between border-t border-rule px-5 py-3.5">
                  <p className="text-sm text-ink-muted">Showing {broadcasts.length} of {total}</p>
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

        </>}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><CampaignsPage /></Suspense>;
}
