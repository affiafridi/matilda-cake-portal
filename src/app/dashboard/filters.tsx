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

export function DashboardFilters({ branches }: { branches?: Branch[] }) {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();
  const range    = params.get("range")  ?? "today";
  const branch   = params.get("branch") ?? "all";

  const isCustom = range === "custom";
  const [showPicker, setShowPicker] = useState(false);
  const [fromVal,    setFromVal]    = useState(params.get("from") ?? "");
  const [toVal,      setToVal]      = useState(params.get("to")   ?? "");
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    if (showPicker) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showPicker]);

  const update = useCallback((updates: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (k === "range"  && v === "today") p.delete("range");
      else if (k === "branch" && v === "all") p.delete("branch");
      else if (v === "") p.delete(k);
      else p.set(k, v);
    }
    // Clear custom date params when switching to a preset
    if (updates.range && updates.range !== "custom") {
      p.delete("from"); p.delete("to");
    }
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [params, router, pathname]);

  function applyCustom() {
    if (!fromVal || !toVal) return;
    update({ range: "custom", from: fromVal, to: toVal });
    setShowPicker(false);
  }

  const isActive = (v: string) =>
    v === "today" ? !params.get("range") || range === "today" : range === v;

  const hasFilter = (!!params.get("range") && range !== "today") || branch !== "all";

  // Label shown on custom button when active
  const customLabel = isCustom && params.get("from") && params.get("to")
    ? `${params.get("from")} → ${params.get("to")}`
    : "Custom";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">

      {/* Calendar icon + label */}
      <div className="flex items-center gap-1.5 text-ink-muted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
          strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wider">Period</span>
      </div>

      <div className="h-5 w-px bg-rule" />

      {/* Preset pills + Custom button */}
      <div className="flex items-center gap-1 rounded-xl border border-rule bg-white p-1 shadow-sm">
        {PRESETS.map((p) => (
          <button key={p.value} onClick={() => update({ range: p.value })}
            className={["rounded-[9px] px-4 py-2 text-sm font-semibold transition-all duration-150",
              isActive(p.value) ? "bg-brand text-white shadow-sm ring-1 ring-brand/20" : "text-ink-muted hover:bg-canvas hover:text-ink",
            ].join(" ")}>
            {p.label}
          </button>
        ))}

        {/* Custom date range */}
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setShowPicker((v) => !v)}
            className={["flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-sm font-semibold transition-all duration-150",
              isCustom ? "bg-brand text-white shadow-sm ring-1 ring-brand/20" : "text-ink-muted hover:bg-canvas hover:text-ink",
            ].join(" ")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
            {customLabel}
          </button>

          {showPicker && (
            <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-rule bg-white p-4 shadow-xl shadow-black/10">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">Custom Date Range</p>
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-ink-muted">From</label>
                  <input type="date" value={fromVal} onChange={(e) => setFromVal(e.target.value)}
                    max={toVal || undefined}
                    className="w-full rounded-xl border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/20" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-ink-muted">To</label>
                  <input type="date" value={toVal} onChange={(e) => setToVal(e.target.value)}
                    min={fromVal || undefined}
                    className="w-full rounded-xl border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/20" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={applyCustom} disabled={!fromVal || !toVal}
                  className="flex-1 rounded-xl bg-brand py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
                  Apply
                </button>
                <button onClick={() => setShowPicker(false)}
                  className="rounded-xl border border-rule px-3 py-2 text-sm text-ink-muted transition hover:bg-canvas">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Branch filter */}
      {branches && branches.length > 1 && (
        <>
          <div className="h-5 w-px bg-rule" />
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <select value={branch} onChange={(e) => update({ branch: e.target.value })}
              className="appearance-none rounded-xl border border-rule bg-white py-2.5 pl-8 pr-8 text-sm font-semibold text-ink shadow-sm transition focus:outline-none focus:ring-1 focus:ring-brand/30">
              <option value="all">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
          </div>
        </>
      )}

      {/* Reset */}
      {hasFilter && (
        <>
          <div className="h-5 w-px bg-rule" />
          <button onClick={() => { setFromVal(""); setToVal(""); update({ range: "today", branch: "all" }); }}
            className="flex items-center gap-1.5 rounded-xl border border-rule bg-white px-4 py-2.5 text-sm font-semibold text-ink-muted shadow-sm transition hover:border-danger/30 hover:bg-danger/5 hover:text-danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
            Reset
          </button>
        </>
      )}
    </div>
  );
}
