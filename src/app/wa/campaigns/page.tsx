"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────

type Broadcast = {
  id: string; name: string; templateName: string; templateLang: string;
  status: string; totalCount: number; sentCount: number;
  deliveredCount: number; readCount: number; failedCount: number;
  createdAt: string; completedAt: string | null;
  sentBy: { name: string } | null;
};

type Totals = {
  campaigns: number; recipients: number; sent: number;
  delivered: number; read: number; failed: number;
};

// ── Date presets ──────────────────────────────────────────────────────────

const PRESETS = [
  { label: "All time",     value: "all" },
  { label: "Today",        value: "today" },
  { label: "Last 7 days",  value: "7d" },
  { label: "Last 30 days", value: "30d" },
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

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: ReactNode; accent?: string;
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

// ── Delivery mini-bar ──────────────────────────────────────────────────────

function MiniBar({ delivered, read, total }: { delivered: number; read: number; total: number }) {
  const dPct = total > 0 ? (delivered / total) * 100 : 0;
  const rPct = total > 0 ? (read      / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
        <div className="flex h-full">
          <div className="bg-emerald-400 transition-all" style={{ width: `${dPct}%` }} />
          <div className="bg-violet-400 transition-all" style={{ width: `${rPct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const router = useRouter();

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
    <div className="min-h-screen bg-canvas">

      {/* Header */}
      <div className="border-b border-rule bg-white px-6 py-5 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">Campaign History</h1>
            <p className="mt-0.5 text-sm text-ink-muted">Track delivery, read rates and per-recipient status.</p>
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
      </div>

      <div className="px-6 py-6 lg:px-8 space-y-6">

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Campaigns"  value={totals.campaigns.toLocaleString()}  sub="In selected period"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-caramel)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>} />
          <StatCard label="Recipients" value={totals.recipients.toLocaleString()} sub="Total contacts reached"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>} />
          <StatCard label="Delivered"  value={totals.delivered.toLocaleString()}  sub={`${delivRate}% delivery rate`}
            accent="text-emerald-700"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>} />
          <StatCard label="Read"       value={totals.read.toLocaleString()}
            sub={totals.delivered > 0 ? `${readRate}% of delivered` : "—"}
            accent="text-violet-700"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>} />
          <StatCard label="Failed"     value={totals.failed.toLocaleString()}
            accent={totals.failed > 0 ? "text-red-600" : "text-ink-muted"}
            icon={<svg viewBox="0 0 24 24" fill="none" stroke={totals.failed > 0 ? "#dc2626" : "#9e7b6d"} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>} />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </div>
            <input type="text" value={search} onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by campaign or template…"
              className="w-full rounded-xl border border-rule bg-white py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand/30 sm:w-72"
            />
          </div>
          <div className="flex items-center gap-1 self-start rounded-xl border border-rule bg-white p-1 sm:self-auto">
            {PRESETS.map((p) => (
              <button key={p.value} onClick={() => handlePreset(p.value)}
                className={["rounded-[9px] px-3.5 py-2 text-sm font-semibold transition",
                  preset === p.value ? "bg-brand text-white shadow-sm" : "text-ink-muted hover:bg-canvas hover:text-ink",
                ].join(" ")}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-rule bg-white overflow-hidden">
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
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25D366]/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-ink">No campaigns yet</p>
              <p className="mt-1 text-xs text-ink-muted max-w-xs">Campaigns sent via the bot will appear here with full delivery tracking.</p>
              <button onClick={() => router.push("/wa/templates")}
                className="mt-4 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#128C7E] transition">
                Send first campaign
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-rule bg-canvas/50 text-left">
                      {["Campaign", "Template", "Date", "Recipients", "Delivered", "Read", "Failed", ""].map((h) => (
                        <th key={h} className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {broadcasts.map((b) => {
                      const delivPct = b.totalCount > 0 ? Math.round((b.deliveredCount / b.totalCount) * 100) : 0;
                      const readPct  = b.totalCount > 0 ? Math.round((b.readCount      / b.totalCount) * 100) : 0;
                      return (
                        <tr key={b.id} className="group hover:bg-canvas/50 transition-colors">
                          <td className="px-5 py-4">
                            <p className="font-semibold text-ink">{b.name}</p>
                            {b.sentBy && <p className="mt-0.5 text-[11px] text-ink-muted">by {b.sentBy.name}</p>}
                            <span className={[
                              "mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              b.status === "COMPLETED" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : b.status === "FAILED" ? "border-red-200 bg-red-50 text-red-600"
                                : "border-amber-200 bg-amber-50 text-amber-700",
                            ].join(" ")}>{b.status}</span>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-ink">{b.templateName}</p>
                            <span className="text-[10px] uppercase tracking-wide text-ink-muted font-semibold">{b.templateLang}</span>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <p className="text-ink">{new Date(b.createdAt).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}</p>
                            <p className="text-xs text-ink-muted">{new Date(b.createdAt).toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" })}</p>
                          </td>
                          <td className="px-5 py-4 tabular-nums font-semibold text-ink">{b.totalCount.toLocaleString()}</td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-emerald-700 tabular-nums">{b.deliveredCount.toLocaleString()}</p>
                            <p className="text-xs text-ink-muted">{delivPct}%</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-violet-700 tabular-nums">{b.readCount.toLocaleString()}</p>
                            <p className="text-xs text-ink-muted">{readPct}%</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className={`font-semibold tabular-nums ${b.failedCount > 0 ? "text-red-600" : "text-ink-muted"}`}>
                              {b.failedCount.toLocaleString()}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MiniBar delivered={b.deliveredCount} read={b.readCount} total={b.totalCount} />
                              <Link href={`/wa/campaigns/${b.id}`}
                                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-rule bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-canvas transition">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                                </svg>
                                View
                              </Link>
                            </div>
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
      </div>
    </div>
  );
}
