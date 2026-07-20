"use client";

import { useEffect, useState, useCallback } from "react";

type AgentStat = {
  agentId:            string;
  agentName:          string;
  totalHandled:       number;
  resolved:           number;
  openCount:          number;
  pendingCount:       number;
  avgResponseMinutes: number | null;
};

type ReportData = {
  from:       string;
  to:         string;
  unassigned: number;
  agents:     AgentStat[];
};

type Range = "today" | "week" | "month" | "custom";

function getRangeDates(range: Range, customFrom: string, customTo: string): { from: string; to: string } {
  const now  = new Date();
  const pad  = (n: number) => String(n).padStart(2, "0");
  const ymd  = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = ymd(now);

  if (range === "today")  return { from: today, to: today };
  if (range === "custom") return { from: customFrom, to: customTo };

  const from = new Date(now);
  if (range === "week")  from.setDate(now.getDate() - 6);
  if (range === "month") from.setDate(now.getDate() - 29);
  return { from: ymd(from), to: today };
}

function fmtMinutes(mins: number | null) {
  if (mins == null) return "—";
  if (mins < 60)    return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function ResolutionBar({ resolved, total }: { resolved: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((resolved / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-ink-muted">{pct}%</span>
    </div>
  );
}

export default function AgentReportPage() {
  const [range,     setRange]     = useState<Range>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [data,      setData]      = useState<ReportData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(() => {
    const { from, to } = getRangeDates(range, customFrom, customTo);
    if (!from || !to) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/admin/reports/agents?from=${from}&to=${to}T23:59:59`)
      .then((r) => r.json())
      .then((j: { ok: boolean; data: ReportData; error?: string }) => {
        if (!j.ok) throw new Error(j.error ?? "Failed");
        setData(j.data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  const maxHandled = Math.max(1, ...(data?.agents.map((a) => a.totalHandled) ?? []));

  const totalHandled  = data?.agents.reduce((s, a) => s + a.totalHandled,  0) ?? 0;
  const totalResolved = data?.agents.reduce((s, a) => s + a.resolved,       0) ?? 0;
  const overallRes    = totalHandled === 0 ? 0 : Math.round((totalResolved / totalHandled) * 100);

  return (
    <div className="min-h-screen bg-canvas px-6 py-5 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Agent Report</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Conversations handled, resolved, and response times by agent</p>
        </div>

        {/* Range selector */}
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "week", "month", "custom"] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={[
                "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                range === r
                  ? "border-brand bg-brand text-white"
                  : "border-rule bg-white text-ink-muted hover:text-ink",
              ].join(" ")}>
              {r === "today" ? "Today" : r === "week" ? "Last 7 days" : r === "month" ? "Last 30 days" : "Custom"}
            </button>
          ))}
          {range === "custom" && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-xl border border-rule bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand/30" />
              <span className="text-xs text-ink-muted">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-xl border border-rule bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand/30" />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {/* Summary cards */}
      {data && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            label="Total Handled"
            value={String(totalHandled)}
            sub={`${data.agents.length} agent${data.agents.length !== 1 ? "s" : ""}`}
            color="text-ink"
          />
          <SummaryCard
            label="Resolved"
            value={String(totalResolved)}
            sub={`${overallRes}% resolution rate`}
            color="text-emerald-600"
          />
          <SummaryCard
            label="Unassigned"
            value={String(data.unassigned)}
            sub="Need attention"
            color={data.unassigned > 0 ? "text-amber-600" : "text-ink-muted"}
          />
          <SummaryCard
            label="Best Avg Response"
            value={(() => {
              const valid = data.agents.filter((a) => a.avgResponseMinutes != null);
              if (!valid.length) return "—";
              const best = valid.reduce((b, a) => (a.avgResponseMinutes! < b.avgResponseMinutes! ? a : b));
              return fmtMinutes(best.avgResponseMinutes);
            })()}
            sub="Fastest agent"
            color="text-brand"
          />
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-rule bg-white overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-canvas" />
            ))}
          </div>
        ) : !data || data.agents.length === 0 ? (
          <div className="py-16 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
              className="mx-auto mb-3 h-8 w-8 text-ink-muted/40">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <p className="text-sm text-ink-muted">No agent activity in this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule bg-canvas text-left text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  <th className="px-5 py-3">Agent</th>
                  <th className="px-4 py-3 text-right">Handled</th>
                  <th className="px-4 py-3 text-right">Resolved</th>
                  <th className="px-4 py-3 text-right">Open</th>
                  <th className="px-4 py-3">Resolution Rate</th>
                  <th className="px-4 py-3 text-right">Avg Response</th>
                  <th className="px-4 py-3">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {data.agents.map((a, idx) => (
                  <tr key={a.agentId} className={idx % 2 === 0 ? "bg-white" : "bg-canvas/50"}>
                    {/* Agent */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                          {a.agentName.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <span className="font-medium text-ink">{a.agentName}</span>
                      </div>
                    </td>
                    {/* Handled */}
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-ink">{a.totalHandled}</td>
                    {/* Resolved */}
                    <td className="px-4 py-3.5 text-right tabular-nums text-emerald-600 font-medium">{a.resolved}</td>
                    {/* Open */}
                    <td className="px-4 py-3.5 text-right tabular-nums text-ink-muted">{a.openCount}</td>
                    {/* Resolution rate */}
                    <td className="px-4 py-3.5">
                      <ResolutionBar resolved={a.resolved} total={a.totalHandled} />
                    </td>
                    {/* Avg response */}
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      <span className={[
                        "font-medium",
                        a.avgResponseMinutes == null  ? "text-ink-muted" :
                        a.avgResponseMinutes <= 5     ? "text-emerald-600" :
                        a.avgResponseMinutes <= 30    ? "text-amber-600" : "text-red-500",
                      ].join(" ")}>
                        {fmtMinutes(a.avgResponseMinutes)}
                      </span>
                    </td>
                    {/* Volume bar */}
                    <td className="px-4 py-3.5">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand/60 transition-all"
                          style={{ width: `${(a.totalHandled / maxHandled) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && (
        <p className="mt-3 text-center text-xs text-ink-muted">
          Showing conversations with activity between{" "}
          {new Date(data.from).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })} and{" "}
          {new Date(data.to).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-white px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={["mt-1.5 text-2xl font-bold tabular-nums", color].join(" ")}>{value}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>
    </div>
  );
}
