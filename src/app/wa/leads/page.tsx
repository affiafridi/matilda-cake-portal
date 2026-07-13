"use client";

import { useEffect, useState, useCallback } from "react";

type Lead = {
  id:           string;
  waId:         string;
  customerName: string;
  phone:        string;
  orderDetails: string;
  source:       string;
  status:       string;
  createdAt:    string;
};

const STATUS_COLORS: Record<string, string> = {
  NEW:       "bg-blue-50 text-blue-700 border-blue-200",
  CONTACTED: "bg-amber-50 text-amber-700 border-amber-200",
  CONVERTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  LOST:      "bg-red-50 text-red-600 border-red-200",
};

const STATUS_OPTIONS = ["NEW", "CONTACTED", "CONVERTED", "LOST"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-AE", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function LeadsPage() {
  const [leads,    setLeads]    = useState<Lead[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [filter,   setFilter]   = useState("");
  const [loading,  setLoading]  = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async (p = 1, status = filter) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "20" });
    if (status) params.set("status", status);
    const r = await fetch(`/api/bot/leads?${params}`).then((r) => r.json());
    if (r.ok) { setLeads(r.data.leads); setTotal(r.data.total); setPage(p); }
    setLoading(false);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(1, filter); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    await fetch("/api/bot/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
    setUpdating(null);
  }

  const totalPages = Math.ceil(total / 20);

  // Summary counts from current loaded data
  const newCount       = leads.filter((l) => l.status === "NEW").length;
  const convertedCount = leads.filter((l) => l.status === "CONVERTED").length;

  return (
    <div className="min-h-screen bg-white">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-4 lg:px-8">
        <div className="flex items-center gap-3">
          <p className="text-[12.5px] text-[#64748b]">
            {total} lead{total !== 1 ? "s" : ""} from the WhatsApp order flow
          </p>
          {total > 0 && (
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">{newCount} New</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">{convertedCount} Converted</span>
            </div>
          )}
        </div>

        {/* ── Status filter tabs ── */}
        <div className="flex items-center gap-0.5 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] p-0.5">
          {["", ...STATUS_OPTIONS].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={[
                "rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-150",
                filter === s
                  ? "bg-white text-[#0f172a] shadow-sm shadow-black/8"
                  : "text-[#64748b] hover:text-[#374151]",
              ].join(" ")}
            >
              {s || "All"}
            </button>
          ))}
        </div>
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
                  <div className="h-3 w-24 rounded bg-rule" />
                  <div className="h-7 w-24 rounded-lg bg-rule" />
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
                Leads appear here when customers go through the WhatsApp order flow
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <table className="w-full text-sm hidden md:table">
                <thead>
                  <tr className="border-b border-rule bg-[#f6f8fa]">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Customer</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Order Details</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Date</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Status</th>
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
                      <td className="px-5 py-4 max-w-sm">
                        <p className="text-xs text-ink-muted line-clamp-2 leading-relaxed">{lead.orderDetails}</p>
                      </td>
                      <td className="px-5 py-4 text-xs text-ink-muted whitespace-nowrap">
                        {fmtDate(lead.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={lead.status}
                          disabled={updating === lead.id}
                          onChange={(e) => updateStatus(lead.id, e.target.value)}
                          className={[
                            "text-xs font-semibold border rounded-lg px-2.5 py-1.5 cursor-pointer focus:outline-none transition disabled:opacity-50",
                            STATUS_COLORS[lead.status] ?? "bg-canvas border-rule text-ink",
                          ].join(" ")}
                        >
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
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
                      <select
                        value={lead.status}
                        disabled={updating === lead.id}
                        onChange={(e) => updateStatus(lead.id, e.target.value)}
                        className={[
                          "text-xs font-semibold border rounded-lg px-2 py-1 cursor-pointer focus:outline-none shrink-0",
                          STATUS_COLORS[lead.status] ?? "",
                        ].join(" ")}
                      >
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <p className="text-xs text-ink-muted leading-relaxed line-clamp-3">{lead.orderDetails}</p>
                    <p className="text-[11px] text-ink-muted/60">{fmtDate(lead.createdAt)}</p>
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
