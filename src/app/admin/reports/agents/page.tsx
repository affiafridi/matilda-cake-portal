"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function parseISO(s: string) { return new Date(`${s}T00:00:00`); }
function sameDay(a: Date, b: Date) { return toISO(a) === toISO(b); }
function inRange(d: Date, from: Date | null, to: Date | null) {
  if (!from || !to) return false;
  return d >= from && d <= to;
}
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y: number, m: number)    { return new Date(y, m, 1).getDay(); }

function fmtMinutes(mins: number | null) {
  if (mins == null) return "—";
  if (mins < 60)    return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" });
}

// ── Mini Calendar ──────────────────────────────────────────────────────────

function MiniCalendar({ year, month, from, to, hovered, onSelect, onHover, onMonthChange }: {
  year: number; month: number;
  from: Date | null; to: Date | null; hovered: Date | null;
  onSelect: (d: Date) => void;
  onHover:  (d: Date | null) => void;
  onMonthChange: (y: number, m: number) => void;
}) {
  const dim      = getDaysInMonth(year, month);
  const firstDay = getFirstDay(year, month);
  const today    = new Date(); today.setHours(0,0,0,0);

  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: dim }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const rangeEnd = to ?? hovered;

  return (
    <div className="w-64 select-none">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => month === 0 ? onMonthChange(year - 1, 11) : onMonthChange(year, month - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748b] hover:bg-[#f6f8fa] hover:text-[#0f172a] transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <p className="text-[13px] font-bold text-[#0f172a]">{MONTHS[month]} {year}</p>
        <button onClick={() => month === 11 ? onMonthChange(year + 1, 0) : onMonthChange(year, month + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748b] hover:bg-[#f6f8fa] hover:text-[#0f172a] transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7">
        {DAYS.map((d) => <div key={d} className="py-1 text-center text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso    = toISO(d);
          const isFrom = from && sameDay(d, from);
          const isTo   = to   && sameDay(d, to);
          const isHov  = !to && hovered && sameDay(d, hovered);
          const inRng  = from && rangeEnd && inRange(d, from < rangeEnd ? from : rangeEnd, from < rangeEnd ? rangeEnd : from);
          const isEdge = isFrom || isTo || isHov;
          const isStart = from && rangeEnd && sameDay(d, from < rangeEnd ? from : rangeEnd);
          const isEnd   = from && rangeEnd && sameDay(d, from < rangeEnd ? rangeEnd : from);
          return (
            <div key={iso} className="relative flex items-center justify-center py-0.5">
              {inRng && !isEdge && <div className="absolute inset-y-0.5 inset-x-0 bg-[#0f172a]/8" />}
              {inRng && isStart  && <div className="absolute inset-y-0.5 right-0 left-1/2 bg-[#0f172a]/8" />}
              {inRng && isEnd    && <div className="absolute inset-y-0.5 left-0 right-1/2 bg-[#0f172a]/8" />}
              <button onClick={() => onSelect(d)} onMouseEnter={() => onHover(d)} onMouseLeave={() => onHover(null)}
                className={["relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium transition-all",
                  isEdge  ? "bg-[#0f172a] font-bold text-white"
                  : inRng ? "text-[#0f172a] hover:bg-[#0f172a]/15"
                  : sameDay(d, today) ? "border border-[#0f172a]/25 text-[#0f172a] hover:bg-[#f6f8fa]"
                  : "text-[#374151] hover:bg-[#f6f8fa]"].join(" ")}>
                {d.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Date Range Picker ──────────────────────────────────────────────────────

function DateRangePicker({ initialFrom, initialTo, onApply, onClose }: {
  initialFrom: string; initialTo: string;
  onApply: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [from,    setFrom]    = useState<Date | null>(initialFrom ? parseISO(initialFrom) : null);
  const [to,      setTo]      = useState<Date | null>(initialTo   ? parseISO(initialTo)   : null);
  const [hovered, setHovered] = useState<Date | null>(null);
  const [year,    setYear]    = useState(today.getFullYear());
  const [month,   setMonth]   = useState(today.getMonth());

  const nextYear  = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;

  function handleSelect(d: Date) {
    if (!from || (from && to)) { setFrom(d); setTo(null); }
    else { if (d < from) { setTo(from); setFrom(d); } else setTo(d); }
  }

  const shortcuts = [
    { label: "This week",     fn: () => { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); setFrom(s); setTo(today); } },
    { label: "Last week",     fn: () => { const s = new Date(today); s.setDate(today.getDate() - today.getDay() - 7); const e = new Date(s); e.setDate(s.getDate() + 6); setFrom(s); setTo(e); } },
    { label: "Last 14 days",  fn: () => { const s = new Date(today); s.setDate(today.getDate() - 13); setFrom(s); setTo(today); } },
    { label: "Last 3 months", fn: () => { const s = new Date(today); s.setMonth(today.getMonth() - 3); setFrom(s); setTo(today); } },
  ];

  return (
    <div className="absolute right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white"
      style={{ minWidth: 580, boxShadow: "0 8px 30px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)" }}>
      <div className="flex">
        <div className="w-36 shrink-0 border-r border-[#f0f2f5] bg-[#f8fafc] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Quick Select</p>
          <div className="space-y-0.5">
            {shortcuts.map((s) => (
              <button key={s.label} onClick={s.fn}
                className="w-full rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-[#64748b] hover:bg-white hover:text-[#0f172a] transition">
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className={["flex-1 rounded-lg border px-3 py-2 text-[13px]",
              from ? "border-[#0f172a]/30 bg-[#0f172a]/5 font-semibold text-[#0f172a]" : "border-[#e5e7eb] bg-[#f8fafc] text-[#94a3b8]"].join(" ")}>
              {from ? toISO(from) : "Start date"}
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#94a3b8]"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <div className={["flex-1 rounded-lg border px-3 py-2 text-[13px]",
              to ? "border-[#0f172a]/30 bg-[#0f172a]/5 font-semibold text-[#0f172a]" : "border-[#e5e7eb] bg-[#f8fafc] text-[#94a3b8]"].join(" ")}>
              {to ? toISO(to) : "End date"}
            </div>
          </div>
          <div className="flex gap-6">
            <MiniCalendar year={year} month={month} from={from} to={to} hovered={hovered}
              onSelect={handleSelect} onHover={setHovered}
              onMonthChange={(y, m) => { setYear(y); setMonth(m); }} />
            <div className="w-px self-stretch bg-[#f0f2f5]" />
            <MiniCalendar year={nextYear} month={nextMonth} from={from} to={to} hovered={hovered}
              onSelect={handleSelect} onHover={setHovered}
              onMonthChange={(y, m) => { setYear(y); setMonth(m === 0 ? 11 : m - 1); }} />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#f0f2f5] pt-3">
            <button onClick={() => { setFrom(null); setTo(null); }}
              className="text-[12px] font-semibold text-[#64748b] hover:text-[#dc2626] transition">Clear</button>
            <div className="flex items-center gap-2">
              <button onClick={onClose}
                className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-[13px] font-semibold text-[#64748b] hover:bg-[#f6f8fa] transition">Cancel</button>
              <button onClick={() => from && to && onApply(toISO(from), toISO(to))} disabled={!from || !to}
                className="rounded-lg bg-[#0f172a] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#1e293b] disabled:opacity-40 transition">Apply</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Resolution bar ─────────────────────────────────────────────────────────

function ResolutionBar({ resolved, total }: { resolved: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((resolved / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-ink-muted">{pct}%</span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "Today",        value: "today" },
  { label: "Last 7 Days",  value: "7d" },
  { label: "Last 30 Days", value: "30d" },
];

function getDateRange(preset: string, customFrom: string, customTo: string) {
  const now = new Date(); now.setHours(0,0,0,0);
  const ymd = (d: Date) => toISO(d);
  if (preset === "custom") return { from: customFrom, to: customTo };
  if (preset === "today")  return { from: ymd(now), to: ymd(now) };
  const from = new Date(now);
  if (preset === "7d")  from.setDate(now.getDate() - 6);
  if (preset === "30d") from.setDate(now.getDate() - 29);
  return { from: ymd(from), to: ymd(now) };
}

export default function AgentReportPage() {
  const [preset,     setPreset]     = useState("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [data,    setData]    = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Close picker on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    }
    if (showPicker) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showPicker]);

  const load = useCallback(() => {
    const { from, to } = getDateRange(preset, customFrom, customTo);
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
  }, [preset, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  const maxHandled    = Math.max(1, ...(data?.agents.map((a) => a.totalHandled) ?? []));
  const totalHandled  = data?.agents.reduce((s, a) => s + a.totalHandled, 0) ?? 0;
  const totalResolved = data?.agents.reduce((s, a) => s + a.resolved,      0) ?? 0;
  const overallRes    = totalHandled === 0 ? 0 : Math.round((totalResolved / totalHandled) * 100);

  const isCustom     = preset === "custom";
  const customLabel  = isCustom && customFrom && customTo ? `${customFrom} → ${customTo}` : "Custom";

  function applyCustom(from: string, to: string) {
    setCustomFrom(from);
    setCustomTo(to);
    setPreset("custom");
    setShowPicker(false);
  }

  return (
    <div className="min-h-screen bg-canvas px-6 py-5 lg:px-8">

      {/* Filter bar — same pattern as dashboard */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-[#64748b]">
          {data
            ? `${fmtLabel(data.from)} — ${fmtLabel(data.to)}`
            : "Loading…"}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented presets */}
          <div className="flex items-center gap-0.5 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] p-0.5">
            {PRESETS.map((p) => (
              <button key={p.value} onClick={() => setPreset(p.value)}
                className={[
                  "rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-150",
                  preset === p.value
                    ? "bg-white text-[#0f172a] shadow-sm shadow-black/8"
                    : "text-[#64748b] hover:text-[#374151]",
                ].join(" ")}>
                {p.label}
              </button>
            ))}

            {/* Custom picker */}
            <div className="relative" ref={pickerRef}>
              <button onClick={() => setShowPicker((v) => !v)}
                className={[
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-150",
                  isCustom
                    ? "bg-white text-[#0f172a] shadow-sm shadow-black/8"
                    : "text-[#64748b] hover:text-[#374151]",
                ].join(" ")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
                {customLabel}
              </button>
              {showPicker && (
                <DateRangePicker
                  initialFrom={customFrom}
                  initialTo={customTo}
                  onApply={applyCustom}
                  onClose={() => setShowPicker(false)}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {/* Summary cards */}
      {data && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total Handled"    value={String(totalHandled)}  sub={`${data.agents.length} agent${data.agents.length !== 1 ? "s" : ""}`} color="text-ink" />
          <SummaryCard label="Resolved"         value={String(totalResolved)} sub={`${overallRes}% resolution rate`} color="text-emerald-600" />
          <SummaryCard label="Unassigned"       value={String(data.unassigned)} sub="Need attention" color={data.unassigned > 0 ? "text-amber-600" : "text-ink-muted"} />
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
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-canvas" />)}
          </div>
        ) : !data || data.agents.length === 0 ? (
          <div className="py-16 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 h-8 w-8 text-ink-muted/40">
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
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                          {a.agentName.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <span className="font-medium text-ink">{a.agentName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-ink">{a.totalHandled}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-emerald-600 font-medium">{a.resolved}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-ink-muted">{a.openCount}</td>
                    <td className="px-4 py-3.5"><ResolutionBar resolved={a.resolved} total={a.totalHandled} /></td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      <span className={["font-medium",
                        a.avgResponseMinutes == null ? "text-ink-muted" :
                        a.avgResponseMinutes <= 5    ? "text-emerald-600" :
                        a.avgResponseMinutes <= 30   ? "text-amber-600" : "text-red-500",
                      ].join(" ")}>{fmtMinutes(a.avgResponseMinutes)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand/60 transition-all"
                          style={{ width: `${(a.totalHandled / maxHandled) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
