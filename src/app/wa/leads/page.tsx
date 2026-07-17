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
  CLICKED:       "bg-slate-100  text-slate-600  border-slate-200",
  FLOW_STARTED:  "bg-blue-50    text-blue-700   border-blue-200",
  ORDER_CREATED: "bg-amber-50   text-amber-700  border-amber-200",
  PAID:          "bg-emerald-50 text-emerald-700 border-emerald-200",
  ABANDONED:     "bg-red-50     text-red-600    border-red-200",
};

const FUNNEL_BG: Record<string, string> = {
  CLICKED:       "bg-slate-50",
  FLOW_STARTED:  "bg-blue-50",
  ORDER_CREATED: "bg-amber-50",
  PAID:          "bg-emerald-50",
  ABANDONED:     "bg-red-50",
};

const CRM_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "LOST"];

const CRM_COLORS: Record<string, string> = {
  NEW:       "bg-slate-100  text-slate-600  border-slate-200",
  CONTACTED: "bg-amber-50   text-amber-700  border-amber-200",
  CONVERTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  LOST:      "bg-red-50     text-red-600    border-red-200",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-AE", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)    return "just now";
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
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

  const totalPages = Math.ceil(total / 20);
  const totalLeads = STAGES.reduce((s, k) => s + (funnelCounts[k] ?? 0), 0);
  const paidCount  = funnelCounts["PAID"] ?? 0;
  const convRate   = totalLeads > 0 ? Math.round((paidCount / totalLeads) * 100) : 0;

  return (
    <div className="space-y-4 px-6 py-5 lg:px-8">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-bold text-[#0f172a] tracking-tight">WhatsApp Leads</h1>
          <p className="text-[12.5px] text-[#64748b] mt-0.5">
            {totalLeads} lead{totalLeads !== 1 ? "s" : ""}
            {totalLeads > 0 && (
              <span className="ml-2 font-semibold text-emerald-600">{convRate}% conversion</span>
            )}
          </p>
        </div>

        {/* Stage filter tabs */}
        <div className="flex items-center gap-px rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] p-0.5">
          {(["", ...STAGES] as string[]).map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={[
                "rounded-md px-2.5 py-1 text-[12px] font-semibold transition-all",
                stageFilter === s
                  ? "bg-white text-[#0f172a] shadow-sm shadow-black/8"
                  : "text-[#64748b] hover:text-[#374151]",
              ].join(" ")}
            >
              {s ? STAGE_LABELS[s] : "All"}
              {s && funnelCounts[s] != null && (
                <span className="ml-1 text-[10px] opacity-50">{funnelCounts[s]}</span>
              )}
              {!s && totalLeads > 0 && (
                <span className="ml-1 text-[10px] opacity-50">{totalLeads}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Funnel bar ── */}
      {totalLeads > 0 && (
        <div className="grid grid-cols-5 divide-x divide-[#e5e7eb] rounded-xl border border-[#e5e7eb] overflow-hidden">
          {STAGES.map((s, i) => {
            const count = funnelCounts[s] ?? 0;
            const pct   = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
            const active = stageFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStageFilter(active ? "" : s)}
                className={[
                  "flex flex-col items-center py-3 px-2 transition-colors group",
                  active ? FUNNEL_BG[s] : "bg-white hover:bg-[#f6f8fa]",
                ].join(" ")}
              >
                <span className="text-[15px] font-bold text-[#0f172a]">{count}</span>
                <span className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wide mt-0.5 leading-tight text-center">
                  {STAGE_LABELS[s]}
                </span>
                {i > 0 && (
                  <span className="text-[10px] text-[#94a3b8] mt-0.5">{pct}%</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Table card ── */}
      <div className="rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">
        {loading ? (
          <div className="divide-y divide-[#f1f5f9]">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                <div className="h-7 w-7 rounded-full bg-[#f1f5f9] shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-28 rounded bg-[#f1f5f9]" />
                  <div className="h-2 w-20 rounded bg-[#f1f5f9]" />
                </div>
                <div className="h-2.5 w-24 rounded bg-[#f1f5f9]" />
                <div className="h-5 w-20 rounded-full bg-[#f1f5f9]" />
                <div className="h-5 w-20 rounded-lg bg-[#f1f5f9]" />
                <div className="h-5 w-16 rounded-lg bg-[#f1f5f9]" />
              </div>
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="py-14 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25}
              className="h-10 w-10 mx-auto text-[#cbd5e1] mb-3">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <p className="text-sm font-semibold text-[#64748b]">No leads found</p>
            <p className="text-xs text-[#94a3b8] mt-1">
              {stageFilter ? `No leads in "${STAGE_LABELS[stageFilter]}" stage` : "Leads appear here when customers interact via WhatsApp"}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="w-full text-sm hidden md:table">
              <thead>
                <tr className="border-b border-[#f1f5f9] bg-[#f8fafc]">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">Customer</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">Product</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">Stage</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">CRM Status</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">Date</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-[#f8fafc] transition-colors">

                    {/* Customer */}
                    <td className="px-4 py-2.5">
                      <p className="text-[13px] font-semibold text-[#0f172a] leading-tight">{lead.customerName}</p>
                      <a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noreferrer"
                        className="text-[11px] text-[#64748b] hover:text-brand transition-colors">
                        +{lead.phone}
                      </a>
                    </td>

                    {/* Product */}
                    <td className="px-4 py-2.5 max-w-[160px]">
                      {lead.productName ? (
                        <>
                          <p className="text-[12px] font-medium text-[#0f172a] truncate leading-tight">{lead.productName}</p>
                          {lead.productPrice && (
                            <p className="text-[11px] text-[#64748b]">{lead.productPrice}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-[12px] text-[#94a3b8] truncate">{lead.orderDetails || "—"}</p>
                      )}
                    </td>

                    {/* Stage */}
                    <td className="px-4 py-2.5">
                      <span className={[
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                        STAGE_COLORS[lead.stage] ?? "bg-[#f1f5f9] border-[#e2e8f0] text-[#64748b]",
                      ].join(" ")}>
                        {STAGE_LABELS[lead.stage] ?? lead.stage}
                      </span>
                      <p className="text-[10px] text-[#94a3b8] mt-0.5">{timeAgo(lead.updatedAt)}</p>
                    </td>

                    {/* CRM Status */}
                    <td className="px-4 py-2.5">
                      <select
                        value={lead.status}
                        disabled={updatingId === lead.id}
                        onChange={(e) => updateStatus(lead.id, e.target.value)}
                        className={[
                          "text-[11px] font-semibold border rounded-full px-2.5 py-0.5 cursor-pointer focus:outline-none appearance-none transition disabled:opacity-50",
                          CRM_COLORS[lead.status] ?? "bg-[#f1f5f9] border-[#e2e8f0] text-[#64748b]",
                        ].join(" ")}
                      >
                        {CRM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-2.5 text-[11px] text-[#94a3b8] whitespace-nowrap">
                      {fmtDate(lead.createdAt)}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/wa/inbox?waId=${encodeURIComponent(lead.waId)}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#374151] hover:bg-[#f8fafc] transition-colors whitespace-nowrap"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-emerald-500">
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
            <div className="divide-y divide-[#f1f5f9] md:hidden">
              {leads.map((lead) => (
                <div key={lead.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-[#0f172a] leading-tight">{lead.customerName}</p>
                      <a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noreferrer"
                        className="text-[11px] text-[#64748b]">+{lead.phone}</a>
                    </div>
                    <span className={[
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0",
                      STAGE_COLORS[lead.stage] ?? "",
                    ].join(" ")}>
                      {STAGE_LABELS[lead.stage] ?? lead.stage}
                    </span>
                  </div>
                  {lead.productName && (
                    <p className="text-[12px] text-[#374151]">
                      {lead.productName}
                      {lead.productPrice && <span className="text-[#94a3b8]"> · {lead.productPrice}</span>}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={lead.status}
                      disabled={updatingId === lead.id}
                      onChange={(e) => updateStatus(lead.id, e.target.value)}
                      className={[
                        "text-[11px] font-semibold border rounded-full px-2.5 py-0.5 cursor-pointer focus:outline-none appearance-none",
                        CRM_COLORS[lead.status] ?? "",
                      ].join(" ")}
                    >
                      {CRM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <Link href={`/wa/inbox?waId=${encodeURIComponent(lead.waId)}`}
                      className="text-[11px] font-semibold text-brand hover:underline">
                      Open Chat →
                    </Link>
                  </div>
                  <p className="text-[10px] text-[#94a3b8]">{fmtDate(lead.createdAt)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => load(page - 1)} disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-[#e5e7eb] bg-white text-[12px] font-semibold text-[#64748b] disabled:opacity-40 hover:bg-[#f8fafc] transition">
            ← Prev
          </button>
          <span className="text-[11px] text-[#94a3b8]">Page {page} of {totalPages}</span>
          <button onClick={() => load(page + 1)} disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-[#e5e7eb] bg-white text-[12px] font-semibold text-[#64748b] disabled:opacity-40 hover:bg-[#f8fafc] transition">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
