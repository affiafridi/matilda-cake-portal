"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";

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

const STATUS_BADGE: Record<string, { label: string; dot: string; text: string; border: string; bg: string }> = {
  PENDING:   { label: "Pending",   dot: "bg-ink-muted/30",  text: "text-ink-muted",  border: "border-rule", bg: "bg-canvas" },
  SENT:      { label: "Sent",      dot: "bg-ink-muted/50",  text: "text-ink-muted",  border: "border-rule", bg: "bg-canvas" },
  DELIVERED: { label: "Delivered", dot: "bg-ink-muted/70",  text: "text-ink",        border: "border-rule", bg: "bg-canvas" },
  READ:      { label: "Read",      dot: "bg-ink",           text: "text-ink",        border: "border-rule", bg: "bg-canvas" },
  FAILED:    { label: "Failed",    dot: "bg-red-500",       text: "text-red-600",    border: "border-red-200", bg: "bg-red-50" },
};

function fmt(d: string | null, mode: "date" | "time" | "both" = "both") {
  if (!d) return "—";
  const opts: Intl.DateTimeFormatOptions =
    mode === "date" ? { day: "numeric", month: "short", year: "numeric" } :
    mode === "time" ? { hour: "2-digit", minute: "2-digit" } :
    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  return new Date(d).toLocaleString("en-AE", opts);
}

function pct(n: number, of: number) {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

// ── Main ─────────────────────────────────────────────────────────────────

export default function BroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [broadcast,     setBroadcast]     = useState<Broadcast | null>(null);
  const [recipients,    setRecipients]    = useState<Recipient[]>([]);
  const [total,         setTotal]         = useState(0);
  const [page,          setPage]          = useState(1);
  const [pages,         setPages]         = useState(1);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [statusFilter,  setStatusFilter]  = useState("");
  const [search,        setSearch]        = useState("");
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((p = 1, sf = statusFilter, q = search) => {
    setLoading(true);
    const ps = new URLSearchParams({ page: String(p) });
    if (sf) ps.set("status", sf);
    if (q)  ps.set("search", q);
    fetch(`/api/broadcasts/${id}?${ps}`)
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

  const b = broadcast;
  const delivPct = b ? pct(b.deliveredCount, b.totalCount) : 0;
  const readPct  = b ? pct(b.readCount,      b.totalCount) : 0;
  const failPct  = b ? pct(b.failedCount,    b.totalCount) : 0;

  return (
    <div className="min-h-screen bg-[#f4f5f7]">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4 lg:px-8">
        <div>
          <h1 className="text-lg font-bold text-ink">{b?.name ?? "—"}</h1>
          {b && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {b.templateName}
              <span className="mx-1.5">·</span>
              {fmt(b.createdAt)}
              {b.sentBy && <><span className="mx-1.5">·</span>by {b.sentBy.name}</>}
            </p>
          )}
        </div>
        {b && (
          <span className={[
            "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
            b.status === "COMPLETED" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : b.status === "FAILED" ? "border-red-200 bg-red-50 text-red-600"
              : "border-amber-200 bg-amber-50 text-amber-700",
          ].join(" ")}>
            {b.status}
          </span>
        )}
      </div>

      <div className="px-6 pb-8 lg:px-8 space-y-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {/* ── Stat cards ── */}
        {b && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: "Recipients", value: b.totalCount,     p: 100 },
              { label: "Sent",       value: b.sentCount,      p: pct(b.sentCount,      b.totalCount) },
              { label: "Delivered",  value: b.deliveredCount, p: delivPct },
              { label: "Read",       value: b.readCount,      p: readPct },
              { label: "Failed",     value: b.failedCount,    p: failPct, danger: b.failedCount > 0 },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-rule bg-white px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{s.label}</p>
                <p className={["mt-2 text-2xl font-bold tabular-nums tracking-tight", s.danger ? "text-red-600" : "text-ink"].join(" ")}>
                  {s.value.toLocaleString()}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">{s.p}%</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Delivery funnel ── */}
        {b && b.totalCount > 0 && (
          <div className="rounded-2xl border border-rule bg-white px-6 py-5">
            <p className="mb-5 text-sm font-bold text-ink">Delivery Funnel</p>
            <div className="space-y-4">
              {[
                { label: "Sent",      count: b.sentCount,      p: pct(b.sentCount, b.totalCount), bar: "bg-slate-400" },
                { label: "Delivered", count: b.deliveredCount, p: delivPct,                       bar: "bg-emerald-500" },
                { label: "Read",      count: b.readCount,      p: readPct,                        bar: "bg-brand" },
                ...(b.failedCount > 0 ? [{ label: "Failed", count: b.failedCount, p: failPct, bar: "bg-red-400" }] : []),
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-muted">{row.label}</span>
                    <span className="text-xs font-bold tabular-nums text-ink">
                      {row.count.toLocaleString()} <span className="font-normal text-ink-muted">({row.p}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                    <div className={["h-full rounded-full transition-all", row.bar].join(" ")} style={{ width: `${row.p}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recipient table ── */}
        <div className="rounded-2xl border border-rule bg-white overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-rule px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-ink">Recipients</p>
              <p className="text-xs text-ink-muted">{total.toLocaleString()} contact{total !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                  </svg>
                </div>
                <input
                  type="text" value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (searchRef.current) clearTimeout(searchRef.current);
                    searchRef.current = setTimeout(() => load(1, statusFilter, e.target.value), 350);
                  }}
                  placeholder="Search name or phone…"
                  className="rounded-xl border border-rule bg-canvas py-2 pl-8 pr-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand/30 w-48"
                />
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-rule bg-canvas p-1">
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <button key={opt.value}
                    onClick={() => { setStatusFilter(opt.value); load(1, opt.value, search); }}
                    className={["rounded-[9px] px-3 py-1.5 text-xs font-semibold transition",
                      statusFilter === opt.value ? "bg-brand text-white" : "text-ink-muted hover:text-ink",
                    ].join(" ")}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="divide-y divide-rule">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-canvas" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 w-36 animate-pulse rounded bg-canvas" />
                    <div className="h-3 w-24 animate-pulse rounded bg-canvas" />
                  </div>
                  <div className="h-6 w-20 animate-pulse rounded-full bg-canvas" />
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
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-rule bg-canvas/50 text-left">
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Contact</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Message Status</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Sent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {recipients.map((r) => {
                      const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.PENDING;
                      const displayName = r.customerName || r.phone || r.waId;
                      const initials = displayName.slice(0, 2).toUpperCase();
                      return (
                        <tr key={r.id} className="hover:bg-canvas/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas text-xs font-bold text-ink-muted">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-ink truncate">{r.customerName || r.waId}</p>
                                <p className="text-xs text-ink-muted">{r.phone || r.waId}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={["inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", badge.bg, badge.border, badge.text].join(" ")}>
                              <span className={["h-1.5 w-1.5 rounded-full", badge.dot].join(" ")} />
                              {badge.label}
                            </span>
                            {r.errorMsg && (
                              <p className="mt-1 text-[11px] text-red-500 max-w-[200px] truncate" title={r.errorMsg}>{r.errorMsg}</p>
                            )}
                            {(r.readAt || r.deliveredAt) && (
                              <p className="mt-1 text-[11px] text-ink-muted">
                                {fmt(r.readAt ?? r.deliveredAt!, "time")} · {fmt(r.readAt ?? r.deliveredAt!, "date")}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            {r.sentAt ? (
                              <>
                                <p className="font-medium text-ink">{fmt(r.sentAt, "time")}</p>
                                <p className="text-xs text-ink-muted">{fmt(r.sentAt, "date")}</p>
                              </>
                            ) : <span className="text-ink-muted">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

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
