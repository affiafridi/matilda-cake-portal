"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

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

  const update = useCallback((updates: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (k === "range"  && v === "today") p.delete("range");
      else if (k === "branch" && v === "all") p.delete("branch");
      else p.set(k, v);
    }
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [params, router, pathname]);

  const isActive = (v: string) =>
    v === "today" ? !params.get("range") || range === "today" : range === v;

  const hasFilter = !!params.get("range") || branch !== "all";

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

      {/* Divider */}
      <div className="h-5 w-px bg-rule" />

      {/* Date preset pills */}
      <div className="flex items-center gap-1 rounded-xl border border-rule bg-white p-1 shadow-sm">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => update({ range: p.value })}
            className={[
              "rounded-[9px] px-4 py-2 text-sm font-semibold transition-all duration-150",
              isActive(p.value)
                ? "bg-brand text-white shadow-sm ring-1 ring-brand/20"
                : "text-ink-muted hover:bg-canvas hover:text-ink",
            ].join(" ")}
          >
            {p.label}
          </button>
        ))}
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
            <select
              value={branch}
              onChange={(e) => update({ branch: e.target.value })}
              className="appearance-none rounded-xl border border-rule bg-white py-2.5 pl-8 pr-8 text-sm font-semibold text-ink shadow-sm transition focus:outline-none focus:ring-1 focus:ring-brand/30"
            >
              <option value="all">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
          </div>
        </>
      )}

      {/* Reset button — only when a non-default filter is active */}
      {hasFilter && (
        <>
          <div className="h-5 w-px bg-rule" />
          <button
            onClick={() => { update({ range: "today", branch: "all" }); }}
            className="flex items-center gap-1.5 rounded-xl border border-rule bg-white px-4 py-2.5 text-sm font-semibold text-ink-muted shadow-sm transition hover:border-danger/30 hover:bg-danger/5 hover:text-danger"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
              strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
            Reset
          </button>
        </>
      )}
    </div>
  );
}
