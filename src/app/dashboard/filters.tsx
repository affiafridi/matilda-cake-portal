"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useRef, useEffect } from "react";

const PRESETS = [
  { label: "Today",        value: "today" },
  { label: "Yesterday",    value: "yesterday" },
  { label: "Last 7 Days",  value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "This Month",   value: "month" },
];

type Branch = { id: string; name: string };

// ── Helpers ───────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function parseISO(s: string) { return new Date(`${s}T00:00:00`); }
function sameDay(a: Date, b: Date) { return toISO(a) === toISO(b); }
function inRange(d: Date, from: Date | null, to: Date | null) {
  if (!from || !to) return false;
  return d >= from && d <= to;
}
function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay(); }

// ── Mini Calendar ─────────────────────────────────────────────────────────

function MiniCalendar({
  year, month, from, to, hovered,
  onSelect, onHover, onMonthChange,
}: {
  year: number; month: number;
  from: Date | null; to: Date | null; hovered: Date | null;
  onSelect: (d: Date) => void;
  onHover: (d: Date | null) => void;
  onMonthChange: (y: number, m: number) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = getFirstDayOfMonth(year, month);
  const today       = new Date(); today.setHours(0,0,0,0);

  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const rangeEnd = to ?? hovered;

  function prevMonth() {
    if (month === 0) onMonthChange(year - 1, 11);
    else onMonthChange(year, month - 1);
  }
  function nextMonth() {
    if (month === 11) onMonthChange(year + 1, 0);
    else onMonthChange(year, month + 1);
  }

  return (
    <div className="w-64 select-none">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={prevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748b] transition hover:bg-[#f6f8fa] hover:text-[#0f172a]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <p className="text-[13px] font-bold text-[#0f172a]">{MONTHS[month]} {year}</p>
        <button onClick={nextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748b] transition hover:bg-[#f6f8fa] hover:text-[#0f172a]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7">
        {DAYS.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso     = toISO(d);
          const isToday = sameDay(d, today);
          const isFrom  = from && sameDay(d, from);
          const isTo    = to   && sameDay(d, to);
          const isHover = !to && hovered && sameDay(d, hovered);
          const inRng   = from && rangeEnd && inRange(d, from < rangeEnd ? from : rangeEnd, from < rangeEnd ? rangeEnd : from);
          const isEdge  = isFrom || isTo || isHover;
          const isStart = from && rangeEnd && sameDay(d, from < rangeEnd ? from : rangeEnd);
          const isEnd   = from && rangeEnd && sameDay(d, from < rangeEnd ? rangeEnd : from);

          return (
            <div key={iso} className="relative flex items-center justify-center py-0.5">
              {inRng && !isEdge && <div className="absolute inset-y-0.5 inset-x-0 bg-[#0f172a]/8" />}
              {inRng && isStart  && <div className="absolute inset-y-0.5 right-0 left-1/2 bg-[#0f172a]/8" />}
              {inRng && isEnd    && <div className="absolute inset-y-0.5 left-0 right-1/2 bg-[#0f172a]/8" />}
              <button
                onClick={() => onSelect(d)}
                onMouseEnter={() => onHover(d)}
                onMouseLeave={() => onHover(null)}
                className={[
                  "relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium transition-all",
                  isEdge   ? "bg-[#0f172a] font-bold text-white"
                  : inRng  ? "text-[#0f172a] hover:bg-[#0f172a]/15"
                  : isToday ? "border border-[#0f172a]/25 text-[#0f172a] hover:bg-[#f6f8fa]"
                  : "text-[#374151] hover:bg-[#f6f8fa]",
                ].join(" ")}>
                {d.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Date Range Picker Dropdown ─────────────────────────────────────────────

function DateRangePicker({
  initialFrom, initialTo,
  onApply, onClose,
}: {
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
    else {
      if (d < from) { setTo(from); setFrom(d); }
      else          { setTo(d); }
    }
  }

  const canApply = from && to;

  const shortcuts = [
    { label: "This week",     onClick: () => { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); setFrom(s); setTo(today); } },
    { label: "Last week",     onClick: () => { const s = new Date(today); s.setDate(today.getDate() - today.getDay() - 7); const e = new Date(s); e.setDate(s.getDate() + 6); setFrom(s); setTo(e); } },
    { label: "Last 14 days",  onClick: () => { const s = new Date(today); s.setDate(today.getDate() - 13); setFrom(s); setTo(today); } },
    { label: "Last 3 months", onClick: () => { const s = new Date(today); s.setMonth(today.getMonth() - 3); setFrom(s); setTo(today); } },
  ];

  return (
    <div className="absolute right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white"
      style={{ minWidth: 580, boxShadow: "0 8px 30px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)" }}>
      <div className="flex">
        {/* Shortcuts sidebar */}
        <div className="w-36 shrink-0 border-r border-[#f0f2f5] bg-[#f8fafc] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Quick Select</p>
          <div className="space-y-0.5">
            {shortcuts.map((s) => (
              <button key={s.label} onClick={s.onClick}
                className="w-full rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-[#64748b] transition hover:bg-white hover:text-[#0f172a]">
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Calendars */}
        <div className="flex-1 p-4">
          {/* Selected range display */}
          <div className="mb-4 flex items-center gap-3">
            <div className={["flex-1 rounded-lg border px-3 py-2 text-[13px] transition",
              from ? "border-[#0f172a]/30 bg-[#0f172a]/5 font-semibold text-[#0f172a]" : "border-[#e5e7eb] bg-[#f8fafc] text-[#94a3b8]"].join(" ")}>
              {from ? toISO(from) : "Start date"}
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#94a3b8]">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            <div className={["flex-1 rounded-lg border px-3 py-2 text-[13px] transition",
              to ? "border-[#0f172a]/30 bg-[#0f172a]/5 font-semibold text-[#0f172a]" : "border-[#e5e7eb] bg-[#f8fafc] text-[#94a3b8]"].join(" ")}>
              {to ? toISO(to) : "End date"}
            </div>
          </div>

          {/* Two-month grid */}
          <div className="flex gap-6">
            <MiniCalendar year={year} month={month} from={from} to={to} hovered={hovered}
              onSelect={handleSelect} onHover={setHovered}
              onMonthChange={(y, m) => { setYear(y); setMonth(m); }} />
            <div className="w-px self-stretch bg-[#f0f2f5]" />
            <MiniCalendar year={nextYear} month={nextMonth} from={from} to={to} hovered={hovered}
              onSelect={handleSelect} onHover={setHovered}
              onMonthChange={(y, m) => { setYear(y); setMonth(m === 0 ? 11 : m - 1); }} />
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between border-t border-[#f0f2f5] pt-3">
            <button onClick={() => { setFrom(null); setTo(null); }}
              className="text-[12px] font-semibold text-[#64748b] transition hover:text-[#dc2626]">
              Clear
            </button>
            <div className="flex items-center gap-2">
              <button onClick={onClose}
                className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-[13px] font-semibold text-[#64748b] transition hover:bg-[#f6f8fa]">
                Cancel
              </button>
              <button onClick={() => canApply && onApply(toISO(from!), toISO(to!))}
                disabled={!canApply}
                className="rounded-lg bg-[#0f172a] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1e293b] disabled:opacity-40">
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Branch Dropdown ────────────────────────────────────────────────────────

function BranchDropdown({ branches, value, onChange }: { branches: Branch[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = branches.find(b => b.id === value);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex h-8 items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-semibold text-[#374151] transition hover:border-[#d1d5db] hover:bg-[#f9fafb]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[#9ca3af]">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>{selected?.name ?? "All Branches"}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
          className={["h-3 w-3 text-[#9ca3af] transition-transform duration-150", open ? "rotate-180" : ""].join(" ")}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[160px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white py-1"
          style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.05)" }}>
          <button
            type="button"
            onClick={() => { onChange("all"); setOpen(false); }}
            className={["flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition",
              value === "all" ? "font-semibold text-[#0f172a]" : "text-[#374151] hover:bg-[#f6f8fa]"].join(" ")}
          >
            {value === "all" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0 text-[#0f172a]"><path d="M20 6L9 17l-5-5"/></svg>}
            <span className={value === "all" ? "pl-0" : "pl-5"}>All Branches</span>
          </button>
          {branches.map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => { onChange(b.id); setOpen(false); }}
              className={["flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition",
                value === b.id ? "font-semibold text-[#0f172a]" : "text-[#374151] hover:bg-[#f6f8fa]"].join(" ")}
            >
              {value === b.id && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0 text-[#0f172a]"><path d="M20 6L9 17l-5-5"/></svg>}
              <span className={value === b.id ? "pl-0" : "pl-5"}>{b.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Filters Component ────────────────────────────────────────────────

export function DashboardFilters({ branches }: { branches?: Branch[] }) {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();
  const range    = params.get("range")  ?? "today";
  const branch   = params.get("branch") ?? "all";

  const isCustom = range === "custom";
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    }
    if (showPicker) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showPicker]);

  const update = useCallback((updates: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (k === "range" && v === "today") p.delete("range");
      else if (k === "branch" && v === "all") p.delete("branch");
      else if (v === "") p.delete(k);
      else p.set(k, v);
    }
    if (updates.range && updates.range !== "custom") { p.delete("from"); p.delete("to"); }
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [params, router, pathname]);

  function applyCustom(from: string, to: string) {
    update({ range: "custom", from, to });
    setShowPicker(false);
  }

  const isActive = (v: string) =>
    v === "today" ? !params.get("range") || range === "today" : range === v;

  const hasFilter = (!!params.get("range") && range !== "today") || branch !== "all";

  const customLabel = isCustom && params.get("from") && params.get("to")
    ? `${params.get("from")} → ${params.get("to")}`
    : "Custom";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">

      {/* Reset button */}
      {hasFilter && (
        <button onClick={() => update({ range: "today", branch: "all" })}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[#64748b] transition hover:bg-[#fef2f2] hover:text-[#dc2626]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
          Reset
        </button>
      )}

      {/* Segmented preset group */}
      <div className="flex items-center gap-0.5 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] p-0.5">
        {PRESETS.map((p) => (
          <button key={p.value} onClick={() => update({ range: p.value })}
            className={[
              "rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-150",
              isActive(p.value)
                ? "bg-white text-[#0f172a] shadow-sm shadow-black/8"
                : "text-[#64748b] hover:text-[#374151]",
            ].join(" ")}>
            {p.label}
          </button>
        ))}

        {/* Custom date range */}
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
              initialFrom={params.get("from") ?? ""}
              initialTo={params.get("to") ?? ""}
              onApply={applyCustom}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
      </div>

      {/* Branch filter */}
      {branches && branches.length > 1 && (
        <BranchDropdown
          branches={branches}
          value={branch}
          onChange={(v) => update({ branch: v })}
        />
      )}

    </div>
  );
}
