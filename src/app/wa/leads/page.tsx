"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Lead = {
  id:           string;
  waId:         string;
  customerName: string;
  phone:        string;
  orderDetails: string;
  source:       string;
  stage:        string;
  status:       string;
  productName:  string | null;
  productPrice: string | null;
  orderId:      string | null;
  createdAt:    string;
  updatedAt:    string;
};

type FunnelCounts = Record<string, number>;

const STAGES = ["CLICKED", "FLOW_STARTED", "ORDER_CREATED", "PAID", "ABANDONED"] as const;

const STAGE_LABELS: Record<string, string> = {
  CLICKED:       "Clicked",
  FLOW_STARTED:  "Form Opened",
  ORDER_CREATED: "Order Created",
  PAID:          "Paid",
  ABANDONED:     "Abandoned",
};

const STAGE_COLORS: Record<string, string> = {
  CLICKED:       "bg-slate-50  text-slate-600  border-slate-200",
  FLOW_STARTED:  "bg-blue-50   text-blue-700   border-blue-200",
  ORDER_CREATED: "bg-amber-50  text-amber-700  border-amber-200",
  PAID:          "bg-emerald-50 text-emerald-700 border-emerald-200",
  ABANDONED:     "bg-red-50    text-red-600    border-red-200",
};

const CRM_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "LOST"];

const CRM_COLORS: Record<string, string> = {
  NEW:       "bg-blue-50   text-blue-700   border-blue-200",
  CONTACTED: "bg-amber-50  text-amber-700  border-amber-200",
  CONVERTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  LOST:      "bg-red-50    text-red-600    border-red-200",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-AE", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60)    return `${mins}m ago`;
  if (mins < 1440)  return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

export default function LeadsPage() {
  const [leads,        setLeads]        = useState<Lead[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [stageFilter,  setStageFilter]  = useState("");
  const [loading,      setLoading]      = useState(true);
  const [updatingId,   setUpdatingId]   = useState<string | null>(null);
  const [funnelCounts, setFunnelCounts] = useState<FunnelCounts>({});

  const load = useCallback(async (p = 1, stage = stageFilter) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "20" });
    if (stage) params.set("stage", stage);
    const r = await fetch(`/api/bot/leads?${params}`).then((r) => r.json());
    if (r.ok) {
      setLeads(r.data.leads);
      setTotal(r.data.total);
      setPage(p);
      setFunnelCounts(r.data.funnelCounts ?? {});
    }
    setLoading(false);
  }, [stageFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(1, stageFilter); }, [stageFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id);
    await fetch("/api/bot/leads", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id, status }),
    });
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
    setUpdatingId(null);
  }

  const totalPages   = Math.ceil(total / 20);
  const totalLeads   = STAGES.reduce((s, k) => s + (funnelCounts[k] ?? 0), 0);
  const paidCount    = funnelCounts["PAID"] ?? 0;
  const convRate     = totalLeads > 0 ? Math.round((paidCount / totalLeads) * 100) : 0;

  return (
    <div className="min-h-screen bg-white">

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4 lg:px-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[12.5px] text-[#64748b]">
              {total} lead{total !== 1 ? "s" : ""}{stageFilter ? ` · ${STAGE_LABELS[stageFilter] ?? stageFilter}` : ""}
              {!stageFilter && totalLeads > 0 && (
                <span className="ml-2 text-emerald-600 font-semibold">{convRate}% conversion</span>
              )}
            </p>
          </div>

          {/* Stage filter tabs */}
          <div className="flex items-center gap-0.5 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] p-0.5">
            {(["", ...STAGES] as string[]).map((s) => (
              <button
                key={s}
                onClick={() => setStageFilter(s)}
                className={[
                  "rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all duration-150",
                  stageFilter === s
                    ? "bg-white text-[#0f172a] shadow-sm shadow-black/8"
                    : "text-[#64748b] hover:text-[#374151]",
                ].join(" ")}
              >
                {s ? STAGE_LABELS[s] : "All"}
                {funnelCounts[s] != null && (
                  <span className="ml-1.5 text-[10px] opacity-60">{funnelCounts[s]}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Funnel bar */}
        {!stageFilter && totalLeads > 0 && (
          <div className="flex items-stretch gap-px rounded-xl overflow-hidden border border-[#e5e7eb]">
            {STAGES.map((s, i) => {
              const count = funnelCounts[s] ?? 0;
              const pct   = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
              return (
                <button
                  key={s}
                  onClick={() => setStageFilter(s)}
                  className="flex-1 flex flex-col items-center justify-center py-3 px-2 bg-[#f6f8fa] hover:bg-white transition-colors group"
                >
                  <span className="text-[18px] font-bold text-ink">{count}</span>
                  <span className="text-[10px] font-semibold text-ink-muted uppercase tracking-wide mt-0.5">{STAGE_LABELS[s]}</span>
                  {i > 0 && (
                    <span className="text-[10px] text-ink-muted/50 mt-0.5">{pct}%</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Table card ── */}
      <div className="px-6 lg:px-8 pb-8">
        <div className="rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">

          {loading ? (
            <div className="divide-y divide-rule">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-rule shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 rounded bg-rule" />
                    <div className="h-2.5 w-48 rounded bg-rule" />
                  </div>
                  <div className="h-3 w-20 rounded bg-rule" />
                  <div className="h-6 w-24 rounded-lg bg-rule" />
                  <div className="h-6 w-20 rounded-lg bg-rule" />
                </div>
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="py-16 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25}
                className="h-12 w-12 mx-auto text-ink-muted/30 mb-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              <p className="text-sm font-semibold text-ink-muted">No leads yet</p>
              <p className="text-xs text-ink-muted/60 mt-1 max-w-xs mx-auto">
                Leads appear here when customers click the Order Today button in WhatsApp
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <table className="w-full text-sm hidden md:table">
                <thead>
                  <tr className="border-b border-rule bg-[#f6f8fa]">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Customer</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Product</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Stage</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">CRM Status</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Date</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-[#f6f8fa] transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-ink">{lead.customerName}</p>
                        <a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noreferrer"
                          className="text-xs text-brand hover:underline">
                          +{lead.phone}
                        </a>
                      </td>
                      <td className="px-5 py-4 max-w-[180px]">
                        {lead.productName ? (
                          <>
                            <p className="text-xs font-medium text-ink truncate">{lead.productName}</p>
                            {lead.productPrice && (
                              <p className="text-xs text-ink-muted">AED {lead.productPrice}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-ink-muted line-clamp-2">{lead.orderDetails || "—"}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={[
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                          STAGE_COLORS[lead.stage] ?? "bg-canvas border-rule text-ink",
                        ].join(" ")}>
                          {STAGE_LABELS[lead.stage] ?? lead.stage}
                        </span>
                        <p className="text-[10px] text-ink-muted/60 mt-0.5">{timeAgo(lead.updatedAt)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={lead.status}
                          disabled={updatingId === lead.id}
                          onChange={(e) => updateStatus(lead.id, e.target.value)}
                          className={[
                            "text-xs font-semibold border rounded-lg px-2.5 py-1.5 cursor-pointer focus:outline-none transition disabled:opacity-50",
                            CRM_COLORS[lead.status] ?? "bg-canvas border-rule text-ink",
                          ].join(" ")}
                        >
                          {CRM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-5 py-4 text-xs text-ink-muted whitespace-nowrap">
                        {fmtDate(lead.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/wa/inbox?waId=${encodeURIComponent(lead.waId)}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-[#f6f8fa] transition-colors whitespace-nowrap"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-brand">
                            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                            <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
                          </svg>
                          Open Chat
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile cards */}
              <div className="divide-y divide-rule md:hidden">
                {leads.map((lead) => (
                  <div key={lead.id} className="px-4 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink text-sm">{lead.customerName}</p>
                        <a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noreferrer"
                          className="text-xs text-brand hover:underline">+{lead.phone}</a>
                      </div>
                      <span className={[
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0",
                        STAGE_COLORS[lead.stage] ?? "",
                      ].join(" ")}>
                        {STAGE_LABELS[lead.stage] ?? lead.stage}
                      </span>
                    </div>
                    {lead.productName && (
                      <p className="text-xs font-medium text-ink">
                        {lead.productName}
                        {lead.productPrice && <span className="text-ink-muted font-normal"> · AED {lead.productPrice}</span>}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <select
                        value={lead.status}
                        disabled={updatingId === lead.id}
                        onChange={(e) => updateStatus(lead.id, e.target.value)}
                        className={[
                          "text-xs font-semibold border rounded-lg px-2 py-1 cursor-pointer focus:outline-none shrink-0",
                          CRM_COLORS[lead.status] ?? "",
                        ].join(" ")}
                      >
                        {CRM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <Link
                        href={`/wa/inbox?waId=${encodeURIComponent(lead.waId)}`}
                        className="text-[11px] font-semibold text-brand hover:underline"
                      >
                        Open Chat →
                      </Link>
                    </div>
                    <p className="text-[10px] text-ink-muted/60">{fmtDate(lead.createdAt)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-5">
            <button onClick={() => load(page - 1)} disabled={page <= 1}
              className="px-4 py-2 rounded-lg border border-[#e5e7eb] bg-white text-[12.5px] font-semibold text-[#64748b] disabled:opacity-40 hover:bg-[#f6f8fa] transition">
              ← Prev
            </button>
            <span className="text-xs text-ink-muted">Page {page} of {totalPages}</span>
            <button onClick={() => load(page + 1)} disabled={page >= totalPages}
              className="px-4 py-2 rounded-lg border border-[#e5e7eb] bg-white text-[12.5px] font-semibold text-[#64748b] disabled:opacity-40 hover:bg-[#f6f8fa] transition">
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
