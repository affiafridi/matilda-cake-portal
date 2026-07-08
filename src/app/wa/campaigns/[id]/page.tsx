"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────

type Broadcast = {
  id: string; name: string; templateName: string; templateLang: string;
  status: string; totalCount: number; sentCount: number;
  deliveredCount: number; readCount: number; failedCount: number;
  createdAt: string; completedAt: string | null;
  sentBy: { id: string; name: string } | null;
};

type Recipient = {
  id: string; waId: string; customerName: string | null; phone: string | null;
  status: string; errorMsg: string | null;
  sentAt: string | null; deliveredAt: string | null;
  readAt: string | null; failedAt: string | null;
  createdAt: string;
};

const STATUS_FILTER_OPTIONS = [
  { value: "",          label: "All" },
  { value: "SENT",      label: "Sent" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "READ",      label: "Read" },
  { value: "FAILED",    label: "Failed" },
];

const STATUS_BADGE: Record<string, { label: string; classes: string; dot: string }> = {
  PENDING:   { label: "Pending",   classes: "bg-gray-50 border-gray-200 text-gray-500",         dot: "bg-gray-400" },
  SENT:      { label: "Sent",      classes: "bg-blue-50 border-blue-200 text-blue-700",          dot: "bg-blue-400" },
  DELIVERED: { label: "Delivered", classes: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-400" },
  READ:      { label: "Read",      classes: "bg-violet-50 border-violet-200 text-violet-700",    dot: "bg-violet-400" },
  FAILED:    { label: "Failed",    classes: "bg-red-50 border-red-200 text-red-600",             dot: "bg-red-400" },
};

function fmt(d: string | null, mode: "date" | "time" | "both" = "both") {
  if (!d) return "—";
  const opts: Intl.DateTimeFormatOptions =
    mode === "date" ? { day: "numeric", month: "short", year: "numeric" } :
    mode === "time" ? { hour: "2-digit", minute: "2-digit" } :
    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  return new Date(d).toLocaleString("en-AE", opts);
}

function FunnelBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-ink-muted">{label}</span>
        <span className="font-bold text-ink tabular-nums">{count.toLocaleString()} <span className="text-ink-muted font-normal">({pct}%)</span></span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────

export default function BroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [broadcast,   setBroadcast]   = useState<Broadcast | null>(null);
  const [recipients,  setRecipients]  = useState<Recipient[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [pages,       setPages]       = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search,      setSearch]      = useState("");
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((p = 1, sf = statusFilter, q = search) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p) });
    if (sf) params.set("status", sf);
    if (q)  params.set("search", q);
    fetch(`/api/broadcasts/${id}?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Failed");
        setBroadcast(json.data.broadcast);
        setRecipients(json.data.recipients ?? []);
        setTotal(json.data.total ?? 0);
        setPages(json.data.pages ?? 1);
        setPage(p);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, statusFilter, search]);

  useEffect(() => { load(1); }, [load]);

  function handleStatusFilter(v: string) {
    setStatusFilter(v);
    load(1, v, search);
  }

  function handleSearch(v: string) {
    setSearch(v);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => load(1, statusFilter, v), 350);
  }

  const b = broadcast;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="border-b border-rule bg-white px-6 py-5 lg:px-8">
        <div className="mb-1 flex items-center gap-2 text-xs text-ink-muted">
          <Link href="/wa/campaigns" className="hover:text-brand transition">Campaign History</Link>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M9 18l6-6-6-6"/></svg>
          <span className="text-ink">{b?.name ?? "Loading…"}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink">{b?.name ?? "—"}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
              {b && <>
                <span className="flex items-center gap-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  {b.templateName}
                  <span className="rounded bg-canvas px-1 py-0.5 uppercase tracking-wide text-[10px] font-semibold">{b.templateLang}</span>
                </span>
                <span>·</span>
                <span>{fmt(b.createdAt)}</span>
                {b.sentBy && <><span>·</span><span>by {b.sentBy.name}</span></>}
              </>}
            </div>
          </div>
          {b && (
            <span className={[
              "shrink-0 rounded-full border px-3 py-1 text-xs font-bold",
              b.status === "COMPLETED" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : b.status === "FAILED"    ? "bg-red-50 border-red-200 text-red-600"
                : "bg-amber-50 border-amber-200 text-amber-700",
            ].join(" ")}>
              {b.status}
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-6 lg:px-8 space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {/* Stat cards */}
        {b && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[
              { label: "Recipients", value: b.totalCount,     color: "text-ink",            bg: "bg-canvas" },
              { label: "Sent",       value: b.sentCount,      color: "text-blue-700",        bg: "bg-blue-50" },
              { label: "Delivered",  value: b.deliveredCount, color: "text-emerald-700",     bg: "bg-emerald-50" },
              { label: "Read",       value: b.readCount,      color: "text-violet-700",      bg: "bg-violet-50" },
              { label: "Failed",     value: b.failedCount,    color: b.failedCount > 0 ? "text-red-600" : "text-ink-muted", bg: b.failedCount > 0 ? "bg-red-50" : "bg-canvas" },
            ].map((s) => (
              <div key={s.label} className={`rounded-2xl border border-rule ${s.bg} p-4`}>
                <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">{s.label}</p>
                <p className={`mt-2 text-3xl font-bold tabular-nums ${s.color}`}>{s.value.toLocaleString()}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {b.totalCount > 0 ? `${Math.round((s.value / b.totalCount) * 100)}%` : "—"}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Delivery funnel */}
        {b && b.totalCount > 0 && (
          <div className="rounded-2xl border border-rule bg-white p-5">
            <p className="mb-4 text-sm font-bold text-ink">Delivery Funnel</p>
            <div className="space-y-3">
              <FunnelBar label="Sent"      count={b.sentCount}      total={b.totalCount} color="bg-blue-400" />
              <FunnelBar label="Delivered" count={b.deliveredCount} total={b.totalCount} color="bg-emerald-400" />
              <FunnelBar label="Read"      count={b.readCount}      total={b.totalCount} color="bg-violet-400" />
              {b.failedCount > 0 && <FunnelBar label="Failed" count={b.failedCount} total={b.totalCount} color="bg-red-400" />}
            </div>
          </div>
        )}

        {/* Recipient table */}
        <div className="rounded-2xl border border-rule bg-white overflow-hidden">
          {/* Table toolbar */}
          <div className="flex flex-col gap-3 border-b border-rule px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-ink">Recipients</p>
              <p className="text-xs text-ink-muted">{total.toLocaleString()} contact{total !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                  </svg>
                </div>
                <input
                  type="text" value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search name or phone…"
                  className="rounded-xl border border-rule bg-canvas py-2 pl-8 pr-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand/30 w-44"
                />
              </div>
              {/* Status filter */}
              <div className="flex items-center gap-1 rounded-xl border border-rule bg-canvas p-1">
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <button key={opt.value}
                    onClick={() => handleStatusFilter(opt.value)}
                    className={["rounded-[9px] px-3 py-1.5 text-xs font-semibold transition",
                      statusFilter === opt.value ? "bg-brand text-white shadow-sm" : "text-ink-muted hover:text-ink",
                    ].join(" ")}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="divide-y divide-rule">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-canvas" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-36 animate-pulse rounded bg-canvas" />
                    <div className="h-3 w-24 animate-pulse rounded bg-canvas" />
                  </div>
                  <div className="ml-auto h-6 w-20 animate-pulse rounded-full bg-canvas" />
                </div>
              ))}
            </div>
          ) : recipients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-canvas">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-ink-muted">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-ink">No recipients found</p>
              <p className="mt-1 text-xs text-ink-muted">Try adjusting your filters.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-rule bg-canvas/50 text-left">
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Contact</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Status</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Sent</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Delivered</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Read</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {recipients.map((r) => {
                      const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.PENDING;
                      const displayName = r.customerName || r.phone || r.waId;
                      const initials = displayName.slice(0, 2).toUpperCase();
                      return (
                        <tr key={r.id} className="hover:bg-canvas/50 transition-colors">
                          {/* Contact */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-ink truncate">{r.customerName || r.waId}</p>
                                <p className="text-xs text-ink-muted">+{r.phone || r.waId}</p>
                              </div>
                            </div>
                          </td>
                          {/* Status */}
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.classes}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                              {badge.label}
                            </span>
                            {r.errorMsg && (
                              <p className="mt-1 text-[11px] text-red-500 max-w-[180px] truncate" title={r.errorMsg}>{r.errorMsg}</p>
                            )}
                          </td>
                          {/* Sent */}
                          <td className="px-5 py-3.5 text-xs text-ink-muted whitespace-nowrap">
                            {r.sentAt ? (
                              <div>
                                <p className="font-medium text-ink">{fmt(r.sentAt, "time")}</p>
                                <p>{fmt(r.sentAt, "date")}</p>
                              </div>
                            ) : "—"}
                          </td>
                          {/* Delivered */}
                          <td className="px-5 py-3.5 text-xs text-ink-muted whitespace-nowrap">
                            {r.deliveredAt ? (
                              <div>
                                <p className="font-medium text-emerald-700">{fmt(r.deliveredAt, "time")}</p>
                                <p>{fmt(r.deliveredAt, "date")}</p>
                              </div>
                            ) : "—"}
                          </td>
                          {/* Read */}
                          <td className="px-5 py-3.5 text-xs text-ink-muted whitespace-nowrap">
                            {r.readAt ? (
                              <div>
                                <p className="font-medium text-violet-700">{fmt(r.readAt, "time")}</p>
                                <p>{fmt(r.readAt, "date")}</p>
                              </div>
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pages > 1 && (
                <div className="flex items-center justify-between border-t border-rule px-5 py-3.5">
                  <p className="text-sm text-ink-muted">Showing {recipients.length} of {total}</p>
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
