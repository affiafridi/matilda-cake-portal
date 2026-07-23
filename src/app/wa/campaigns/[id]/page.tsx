"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

type Broadcast = {
  id: string; name: string; templateName: string; templateLang: string;
  status: string; totalCount: number; sentCount: number;
  deliveredCount: number; readCount: number; failedCount: number; skippedCount: number;
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

// System badge: did we successfully send it, or did it fail?
const SYSTEM_BADGE: Record<string, { label: string; dot: string; text: string; border: string; bg: string }> = {
  default: { label: "Sent",   dot: "bg-emerald-400", text: "text-emerald-700", border: "border-emerald-200", bg: "bg-emerald-50" },
  FAILED:  { label: "Failed", dot: "bg-red-400",     text: "text-red-600",    border: "border-red-200",     bg: "bg-red-50" },
  PENDING: { label: "Pending",dot: "bg-amber-400",   text: "text-amber-700",  border: "border-amber-200",   bg: "bg-amber-50" },
};

// User badge: what the recipient did with the message
const USER_BADGE: Record<string, { label: string; dot: string; text: string; border: string; bg: string }> = {
  READ:      { label: "Read",      dot: "bg-[#0f172a]",  text: "text-[#0f172a]",  border: "border-[#cbd5e1]", bg: "bg-[#f1f5f9]" },
  DELIVERED: { label: "Delivered", dot: "bg-blue-400",   text: "text-blue-700",   border: "border-blue-200",  bg: "bg-blue-50" },
  default:   { label: "Waiting",   dot: "bg-[#d1d5db]",  text: "text-[#9ca3af]",  border: "border-[#e5e7eb]", bg: "bg-[#f9fafb]" },
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

  // Auto-refresh every 3 s while campaign is still sending
  useEffect(() => {
    if (!broadcast || broadcast.status !== "SENDING") return;
    const timer = setInterval(() => load(page, statusFilter, search), 3000);
    return () => clearInterval(timer);
  }, [broadcast, load, page, statusFilter, search]);

  const b = broadcast;
  const delivPct = b ? pct(b.deliveredCount, b.totalCount) : 0;
  const readPct  = b ? pct(b.readCount,      b.totalCount) : 0;
  const failPct  = b ? pct(b.failedCount,    b.totalCount) : 0;

  return (
    <div className="min-h-screen bg-white">

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
          b.status === "SENDING" ? (
            <span className="inline-flex items-center gap-2 shrink-0 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              Sending… {b.sentCount + b.failedCount}/{b.totalCount}
            </span>
          ) : (
            <span className={[
              "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
              b.status === "COMPLETED" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : b.status === "FAILED" ? "border-red-200 bg-red-50 text-red-600"
                : "border-amber-200 bg-amber-50 text-amber-700",
            ].join(" ")}>
              {b.status}
            </span>
          )
        )}
      </div>

      {/* Live progress bar while sending */}
      {b?.status === "SENDING" && b.totalCount > 0 && (
        <div className="px-6 lg:px-8 pb-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${Math.round(((b.sentCount + b.failedCount) / b.totalCount) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-blue-600">
            Sending in background — {b.sentCount + b.failedCount} of {b.totalCount} processed. You can navigate away freely.
          </p>
        </div>
      )}

      <div className="px-6 pb-8 lg:px-8 space-y-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {/* ── Opted-out notice ── */}
        {b && b.skippedCount > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">{b.skippedCount} customer{b.skippedCount !== 1 ? "s" : ""} skipped</span>
            {" — "}
            {b.skippedCount === 1
              ? "this customer had previously unsubscribed and did not receive this message."
              : "these customers had previously unsubscribed and did not receive this message."}
          </div>
        )}

        {/* ── Stat cards ── */}
        {b && (
          <div className={["grid gap-3", b.skippedCount > 0 ? "grid-cols-2 lg:grid-cols-6" : "grid-cols-2 lg:grid-cols-5"].join(" ")}>
            {[
              { label: "Recipients", value: b.totalCount,     p: 100 },
              { label: "Sent",       value: b.sentCount,      p: pct(b.sentCount,      b.totalCount) },
              { label: "Delivered",  value: b.deliveredCount, p: delivPct },
              { label: "Read",       value: b.readCount,      p: readPct },
              { label: "Failed",     value: b.failedCount,    p: failPct, danger: b.failedCount > 0 },
              ...(b.skippedCount > 0 ? [{ label: "Skipped", value: b.skippedCount, p: pct(b.skippedCount, b.totalCount + b.skippedCount), warn: true }] : []),
            ].map((s) => (
              <div key={s.label} className={[
                "rounded-xl border px-5 py-4",
                "warn" in s && s.warn ? "border-amber-200 bg-amber-50" : "border-[#e5e7eb] bg-[#f6f8fa]",
              ].join(" ")}>
                <p className={["text-[11px] font-semibold uppercase tracking-wider", "warn" in s && s.warn ? "text-amber-700" : "text-[#64748b]"].join(" ")}>{s.label}</p>
                <p className={["mt-2 text-2xl font-bold tabular-nums tracking-tight", "danger" in s && s.danger ? "text-red-600" : "warn" in s && s.warn ? "text-amber-800" : "text-[#0f172a]"].join(" ")}>
                  {s.value.toLocaleString()}
                </p>
                <p className={["mt-0.5 text-[11px]", "warn" in s && s.warn ? "text-amber-600" : "text-[#64748b]"].join(" ")}>{s.p}%</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Delivery funnel ── */}
        {b && b.totalCount > 0 && (
          <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] px-6 py-5">
            <p className="mb-5 text-sm font-bold text-[#0f172a]">Delivery Funnel</p>
            <div className="space-y-4">
              {[
                { label: "Sent",      count: b.sentCount,      p: pct(b.sentCount, b.totalCount), bar: "bg-slate-400" },
                { label: "Delivered", count: b.deliveredCount, p: delivPct,                       bar: "bg-emerald-500" },
                { label: "Read",      count: b.readCount,      p: readPct,                        bar: "bg-[#0f172a]" },
                ...(b.failedCount > 0 ? [{ label: "Failed", count: b.failedCount, p: failPct, bar: "bg-red-400" }] : []),
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-[#64748b]">{row.label}</span>
                    <span className="text-xs font-bold tabular-nums text-[#0f172a]">
                      {row.count.toLocaleString()} <span className="font-normal text-[#64748b]">({row.p}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
                    <div className={["h-full rounded-full transition-all", row.bar].join(" ")} style={{ width: `${row.p}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recipient table ── */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[#e5e7eb] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">Recipients</p>
              <p className="text-xs text-[#64748b]">{total.toLocaleString()} contact{total !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]">
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
                  className="h-8 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] pl-8 pr-3 text-[13px] text-[#0f172a] placeholder:text-[#9ca3af] focus:bg-white focus:outline-none transition w-48"
                />
              </div>
              <div className="flex items-center gap-0.5 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] p-0.5">
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <button key={opt.value}
                    onClick={() => { setStatusFilter(opt.value); load(1, opt.value, search); }}
                    className={["rounded-md px-3 py-1 text-xs font-semibold transition",
                      statusFilter === opt.value
                        ? "bg-white text-[#0f172a] shadow-sm shadow-black/8"
                        : "text-[#64748b] hover:text-[#0f172a]",
                    ].join(" ")}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="divide-y divide-[#f1f5f9]">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-[#f1f5f9]" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 w-36 animate-pulse rounded bg-[#f1f5f9]" />
                    <div className="h-3 w-24 animate-pulse rounded bg-[#f1f5f9]" />
                  </div>
                  <div className="h-6 w-20 animate-pulse rounded-full bg-[#f1f5f9]" />
                </div>
              ))}
            </div>
          ) : recipients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f6f8fa]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-[#64748b]">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-[#0f172a]">No recipients found</p>
              <p className="mt-1 text-xs text-[#64748b]">Try adjusting your filters.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] bg-[#f6f8fa] text-left">
                      <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Contact</th>
                      <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">System</th>
                      <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {recipients.map((r) => {
                      const sysBadge = r.status === "FAILED"  ? SYSTEM_BADGE.FAILED
                                     : r.status === "PENDING" ? SYSTEM_BADGE.PENDING
                                     : SYSTEM_BADGE.default;
                      const usrBadge = r.readAt      ? USER_BADGE.READ
                                     : r.deliveredAt ? USER_BADGE.DELIVERED
                                     : USER_BADGE.default;
                      const displayName = r.customerName || r.phone || r.waId;
                      const initials = displayName.slice(0, 2).toUpperCase();
                      return (
                        <tr key={r.id} className="hover:bg-[#f6f8fa] transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-[11px] font-bold text-[#64748b]">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-[#0f172a] truncate">{r.customerName || r.waId}</p>
                                <p className="text-[11px] text-[#9ca3af]">{r.phone || r.waId}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className={["inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold", sysBadge.bg, sysBadge.border, sysBadge.text].join(" ")}>
                                <span className={["h-1.5 w-1.5 rounded-full shrink-0", sysBadge.dot].join(" ")} />
                                {sysBadge.label}
                              </span>
                              {r.sentAt && <span className="text-[11px] text-[#9ca3af]">{fmt(r.sentAt, "time")} · {fmt(r.sentAt, "date")}</span>}
                              {r.errorMsg && <span className="text-[11px] text-red-500 truncate max-w-[160px]" title={r.errorMsg}>{r.errorMsg}</span>}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className={["inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold", usrBadge.bg, usrBadge.border, usrBadge.text].join(" ")}>
                                <span className={["h-1.5 w-1.5 rounded-full shrink-0", usrBadge.dot].join(" ")} />
                                {usrBadge.label}
                              </span>
                              {(r.readAt || r.deliveredAt) && (
                                <span className="text-[11px] text-[#9ca3af]">{fmt(r.readAt ?? r.deliveredAt!, "time")} · {fmt(r.readAt ?? r.deliveredAt!, "date")}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {pages > 1 && (
                <div className="flex items-center justify-between border-t border-[#e5e7eb] px-5 py-3.5">
                  <p className="text-sm text-[#64748b]">Showing {recipients.length} of {total}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => load(page - 1)} disabled={page <= 1}
                      className="rounded-lg border border-[#e5e7eb] bg-white px-3.5 py-1.5 text-sm font-medium text-[#0f172a] hover:bg-[#f6f8fa] disabled:opacity-40 transition">
                      Previous
                    </button>
                    <span className="px-2 text-sm text-[#64748b]">Page {page} of {pages}</span>
                    <button onClick={() => load(page + 1)} disabled={page >= pages}
                      className="rounded-lg border border-[#e5e7eb] bg-white px-3.5 py-1.5 text-sm font-medium text-[#0f172a] hover:bg-[#f6f8fa] disabled:opacity-40 transition">
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
