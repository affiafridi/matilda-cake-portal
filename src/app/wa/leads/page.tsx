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
  return new Date(iso).toLocaleString("en-AE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function LeadsPage() {
  const [leads,   setLeads]   = useState<Lead[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [filter,  setFilter]  = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async (p = 1, status = filter) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "20" });
    if (status) params.set("status", status);
    const r = await fetch(`/api/bot/leads?${params}`).then(r => r.json());
    if (r.ok) { setLeads(r.data.leads); setTotal(r.data.total); setPage(p); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(1, filter); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    await fetch("/api/bot/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    setUpdating(null);
  }

  const totalPages = Math.ceil(total / 20);

  // Stats
  const counts = STATUS_OPTIONS.reduce((acc, s) => ({ ...acc, [s]: 0 }), {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">WhatsApp Leads</h1>
          <p className="text-sm text-ink-muted mt-0.5">{total} lead{total !== 1 ? "s" : ""} captured from WhatsApp order flow</p>
        </div>
        <div className="flex items-center gap-2">
          {["", ...STATUS_OPTIONS].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={["px-3 py-1.5 rounded-xl text-xs font-semibold border transition", filter === s
                ? "bg-brand text-white border-brand"
                : "bg-canvas text-ink-muted border-rule hover:border-brand/40"].join(" ")}>
              {s || "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-rule bg-canvas overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-ink-muted animate-pulse">Loading leads…</div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-10 w-10 mx-auto text-ink-muted/40 mb-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/>
            </svg>
            <p className="text-sm font-medium text-ink-muted">No leads yet</p>
            <p className="text-xs text-ink-muted/70 mt-1">Leads appear when customers go through the WhatsApp order flow</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule bg-canvas/60">
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted uppercase tracking-wide">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted uppercase tracking-wide">Order Details</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {leads.map(lead => (
                <tr key={lead.id} className="hover:bg-cream/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{lead.customerName}</p>
                    <a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noreferrer"
                      className="text-xs text-brand hover:underline">+{lead.phone}</a>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-ink-muted line-clamp-2 text-xs leading-relaxed">{lead.orderDetails}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">{fmtDate(lead.createdAt)}</td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.status}
                      disabled={updating === lead.id}
                      onChange={e => updateStatus(lead.id, e.target.value)}
                      className={["text-xs font-semibold border rounded-lg px-2 py-1 cursor-pointer focus:outline-none", STATUS_COLORS[lead.status] ?? ""].join(" ")}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => load(page - 1)} disabled={page <= 1}
            className="px-3 py-1.5 rounded-xl border border-rule text-xs font-medium disabled:opacity-40 hover:bg-cream transition">← Prev</button>
          <span className="text-xs text-ink-muted">Page {page} of {totalPages}</span>
          <button onClick={() => load(page + 1)} disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-xl border border-rule text-xs font-medium disabled:opacity-40 hover:bg-cream transition">Next →</button>
        </div>
      )}
    </div>
  );
}
