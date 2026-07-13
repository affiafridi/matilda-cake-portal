"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────

type TemplateButton = { type: string; text: string; url?: string; example?: string[] };
type TemplateComponent = {
  type: string; text?: string; format?: string;
  example?: { body_text?: string[][] };
  buttons?: TemplateButton[];
};
type Template = {
  id: string; name: string; status: string;
  language: string; category: string;
  components: TemplateComponent[];
};
type CampaignResult = {
  sent: number; failed: number;
  results: { wa_id: string; status: string; error?: string }[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function getComp(t: Template, type: string) {
  return t.components.find((c) => c.type === type);
}

function hasImageHeader(t: Template) {
  const h = getComp(t, "HEADER");
  return h?.format === "IMAGE" || h?.format === "VIDEO" || h?.format === "DOCUMENT";
}

// Count unique {{n}} variables in body text
function countBodyVars(t: Template): number {
  const body = getComp(t, "BODY");
  if (!body?.text) return 0;
  const matches = body.text.match(/\{\{(\d+)\}\}/g) ?? [];
  return new Set(matches.map((m) => m.replace(/\{|\}/g, ""))).size;
}

// Find dynamic URL button (url contains {{1}}) and its index in the buttons array
function getDynamicUrlButton(t: Template): { btn: TemplateButton; idx: number } | null {
  const btns = getComp(t, "BUTTONS")?.buttons ?? [];
  for (let i = 0; i < btns.length; i++) {
    if (btns[i].type === "URL" && btns[i].url?.includes("{{1}}")) return { btn: btns[i], idx: i };
  }
  return null;
}

// Find COPY_CODE button and its index
function getCouponButton(t: Template): { btn: TemplateButton; idx: number } | null {
  const btns = getComp(t, "BUTTONS")?.buttons ?? [];
  for (let i = 0; i < btns.length; i++) {
    if (btns[i].type === "COPY_CODE") return { btn: btns[i], idx: i };
  }
  return null;
}

const CAT_COLOR: Record<string, string> = {
  MARKETING: "bg-purple-50 text-purple-600 border-purple-100",
  UTILITY: "bg-blue-50 text-blue-600 border-blue-100",
  AUTHENTICATION: "bg-orange-50 text-orange-600 border-orange-100",
};

const inputCls = "w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-ink focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20";

// ── Customer Picker Modal ─────────────────────────────────────────────────

type Customer = {
  wa_id: string; name: string; language: string;
  last_seen: string; total_messages: number; tags: string[];
};

const PAGE_SIZE = 50;

function CustomerPickerModal({
  open, initial, onClose, onApply,
}: {
  open: boolean;
  initial: string[];
  onClose: () => void;
  onApply: (ids: string[]) => void;
}) {
  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [pages,      setPages]      = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [loadingMore,setLoadingMore]= useState(false);
  const [query,      setQuery]      = useState("");
  const [tagFilter,  setTagFilter]  = useState("");
  const [allTags,    setAllTags]    = useState<string[]>([]);
  const [selected,   setSelected]   = useState<Set<string>>(new Set(initial));
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef      = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback((q: string, tag: string, p: number, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    const ps = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
    if (q)   ps.set("q", q);
    if (tag) ps.set("tag", tag);
    fetch(`/api/bot/customers?${ps}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) return;
        const list: Customer[] = json.data.customers ?? [];
        setCustomers((prev) => append ? [...prev, ...list] : list);
        setTotal(json.data.total ?? 0);
        setPage(json.data.page ?? p);
        setPages(json.data.pages ?? 1);
      })
      .finally(() => { setLoading(false); setLoadingMore(false); });
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery(""); setTagFilter(""); setPage(1);
    setSelected(new Set(initial));
    fetchPage("", "", 1);
    fetch("/api/bot/customers/tags")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setAllTags(j.data ?? []); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function search(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchPage(val, tagFilter, 1); }, 300);
  }

  function filterTag(tag: string) {
    const next = tag === tagFilter ? "" : tag;
    setTagFilter(next);
    fetchPage(query, next, 1);
  }

  function loadMore() {
    if (loadingMore || page >= pages) return;
    fetchPage(query, tagFilter, page + 1, true);
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const n = new Set(prev);
      customers.forEach((c) => n.add(c.wa_id));
      return n;
    });
  }

  function selectAllMatching() {
    // fetch all IDs matching current filter, then add them
    const ps = new URLSearchParams({ limit: "1000" });
    if (query)    ps.set("q", query);
    if (tagFilter) ps.set("tag", tagFilter);
    fetch(`/api/bot/customers?${ps}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) return;
        const ids: string[] = (json.data.customers ?? []).map((c: Customer) => c.wa_id);
        setSelected((prev) => {
          const n = new Set(prev);
          ids.forEach((id) => n.add(id));
          return n;
        });
      });
  }

  function deselectAll() {
    setSelected(new Set());
  }

  // Infinite scroll: detect when list nears bottom
  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120 && !loadingMore && page < pages) {
      loadMore();
    }
  }

  function fmtDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" });
  }

  if (!open) return null;

  const allVisibleSelected = customers.length > 0 && customers.every((c) => selected.has(c.wa_id));
  const someVisibleSelected = customers.some((c) => selected.has(c.wa_id));
  const hasFilter = !!(query || tagFilter);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex h-[92dvh] sm:h-[82vh] w-full sm:max-w-2xl flex-col rounded-t-3xl sm:rounded-2xl border border-rule bg-white overflow-hidden">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-rule px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-ink">Select Customers</h2>
            <p className="text-xs text-ink-muted">{total.toLocaleString()} customer{total !== 1 ? "s" : ""} total</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl border border-rule text-ink-muted hover:bg-canvas transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Search + filters */}
        <div className="shrink-0 space-y-3 border-b border-rule px-5 py-3">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="search" value={query} onChange={(e) => search(e.target.value)}
              placeholder="Search by name or phone…"
              className="w-full rounded-xl border border-rule bg-canvas py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink-muted focus:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/10" />
            {loading && (
              <svg className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            )}
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button key={tag} onClick={() => filterTag(tag)}
                  className={["rounded-full border px-3 py-1 text-xs font-medium transition",
                    tagFilter === tag ? "border-brand bg-brand text-white" : "border-rule bg-canvas text-ink-muted hover:border-brand/40 hover:text-ink",
                  ].join(" ")}>
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Select all bar */}
        <div className="shrink-0 flex items-center justify-between border-b border-rule bg-canvas/60 px-5 py-2.5">
          <div className="flex items-center gap-2">
            <button onClick={() => allVisibleSelected ? deselectAll() : selectAllVisible()}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-rule bg-white transition hover:border-brand/40">
              {allVisibleSelected ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 bg-brand rounded-[2px]"><path d="M20 6L9 17l-5-5"/></svg>
              ) : someVisibleSelected ? (
                <div className="h-2 w-2 rounded-[1px] bg-brand/60" />
              ) : null}
            </button>
            <span className="text-xs text-ink-muted">
              {allVisibleSelected ? "Deselect visible" : "Select visible"}
              {hasFilter && ` (${customers.length} shown)`}
            </span>
          </div>
          {hasFilter && total > customers.length && (
            <button onClick={selectAllMatching}
              className="text-xs font-semibold text-brand hover:underline transition">
              Select all {total.toLocaleString()} matching
            </button>
          )}
        </div>

        {/* List */}
        <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto divide-y divide-rule">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                <div className="h-5 w-5 animate-pulse rounded border border-rule bg-canvas" />
                <div className="h-8 w-8 animate-pulse rounded-full bg-canvas" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 w-36 animate-pulse rounded bg-canvas" />
                  <div className="h-3 w-24 animate-pulse rounded bg-canvas" />
                </div>
              </div>
            ))
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="mb-3 h-8 w-8 text-ink-muted/40">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
              <p className="text-sm font-medium text-ink">No customers found</p>
              <p className="mt-1 text-xs text-ink-muted">Try a different search term or tag.</p>
            </div>
          ) : (
            <>
              {customers.map((c) => {
                const isSelected = selected.has(c.wa_id);
                const initials = (c.name || c.wa_id).slice(0, 2).toUpperCase();
                return (
                  <button key={c.wa_id} type="button" onClick={() => toggleOne(c.wa_id)}
                    className={["flex w-full items-center gap-3 px-5 py-3 text-left transition-colors",
                      isSelected ? "bg-brand/5" : "hover:bg-canvas",
                    ].join(" ")}>
                    {/* Checkbox */}
                    <div className={["flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all",
                      isSelected ? "border-brand bg-brand" : "border-rule bg-white",
                    ].join(" ")}>
                      {isSelected && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      )}
                    </div>
                    {/* Avatar */}
                    <div className={["flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                      isSelected ? "bg-brand text-white" : "bg-canvas text-ink-muted",
                    ].join(" ")}>
                      {initials}
                    </div>
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{c.name || c.wa_id}</p>
                        {c.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="shrink-0 rounded-full border border-rule bg-canvas px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-ink-muted">+{c.wa_id} · {fmtDate(c.last_seen)}</p>
                    </div>
                    {/* Message count */}
                    {c.total_messages > 0 && (
                      <span className="shrink-0 text-xs text-ink-muted tabular-nums">{c.total_messages.toLocaleString()} msg{c.total_messages !== 1 ? "s" : ""}</span>
                    )}
                  </button>
                );
              })}
              {/* Load more trigger */}
              {page < pages && (
                <div className="flex items-center justify-center py-4">
                  {loadingMore ? (
                    <svg className="h-5 w-5 animate-spin text-ink-muted" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  ) : (
                    <button onClick={loadMore} className="text-xs font-semibold text-brand hover:underline">
                      Load more ({total - customers.length} remaining)
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-rule bg-white px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {selected.size > 0 ? (
                <>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{selected.size > 99 ? "99+" : selected.size}</div>
                  <span className="text-sm font-medium text-ink">{selected.size.toLocaleString()} customer{selected.size !== 1 ? "s" : ""} selected</span>
                  <button onClick={deselectAll} className="text-xs text-ink-muted hover:text-danger transition">Clear</button>
                </>
              ) : (
                <span className="text-sm text-ink-muted">No customers selected</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose}
                className="rounded-xl border border-rule px-4 py-2.5 text-sm font-semibold text-ink-muted hover:bg-canvas transition">
                Cancel
              </button>
              <button
                onClick={() => { onApply(Array.from(selected)); onClose(); }}
                disabled={selected.size === 0}
                className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
                Apply · {selected.size}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Schedule Picker ───────────────────────────────────────────────────────

const SC_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SC_DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function sameDay(a: Date, b: Date) { return toISO(a) === toISO(b); }

function SchedulePicker({
  value, onChange,
}: {
  value: string; // ISO datetime-local string "YYYY-MM-DDTHH:mm"
  onChange: (v: string) => void;
}) {
  const now     = new Date();
  const initDate = value ? new Date(value) : null;
  const [year,  setYear]  = useState(initDate?.getFullYear()  ?? now.getFullYear());
  const [month, setMonth] = useState(initDate?.getMonth()     ?? now.getMonth());
  const [selDate, setSelDate] = useState<Date | null>(initDate);
  const initTime = value ? value.slice(11, 16) : "09:00";
  const initH24  = parseInt(initTime.split(":")[0], 10);
  const [hour12, setHour12] = useState(initH24 === 0 ? 12 : initH24 > 12 ? initH24 - 12 : initH24);
  const [minute, setMinute] = useState(parseInt(initTime.split(":")[1], 10));
  const [ampm,   setAmpm]   = useState<"AM"|"PM">(initH24 < 12 ? "AM" : "PM");
  const [time,   setTime]   = useState(initTime);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  function selectDay(d: Date) {
    setSelDate(d);
    const iso = toISO(d);
    onChange(`${iso}T${time}`);
  }

  function applyTime(h12: number, min: number, period: "AM"|"PM") {
    const h24 = period === "AM" ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12);
    const t = `${String(h24).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
    setTime(t);
    if (selDate) onChange(`${toISO(selDate)}T${t}`);
  }
  function changeTime(t: string) {
    setTime(t);
    if (selDate) onChange(`${toISO(selDate)}T${t}`);
  }

  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const firstDayOfWk  = new Date(year, month, 1).getDay();
  const cells: (Date | null)[] = [
    ...Array(firstDayOfWk).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const minDate = new Date(); minDate.setHours(0, 0, 0, 0);

  return (
    <div className="rounded-xl border border-rule bg-white p-4 space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={prevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition hover:bg-canvas hover:text-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span className="text-sm font-bold text-ink">{SC_MONTHS[month]} {year}</span>
        <button type="button" onClick={nextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition hover:bg-canvas hover:text-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7">
        {SC_DAYS.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-bold uppercase tracking-wider text-ink-muted">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 -mt-2">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const isPast   = d < minDate;
          const isSel    = selDate && sameDay(d, selDate);
          const isToday  = sameDay(d, today);
          return (
            <div key={toISO(d)} className="flex items-center justify-center py-0.5">
              <button
                type="button"
                disabled={isPast}
                onClick={() => selectDay(d)}
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all",
                  isPast   ? "cursor-not-allowed text-ink-muted/40"
                  : isSel  ? "bg-brand text-white font-bold"
                  : isToday? "border border-brand/30 text-brand hover:bg-brand/10"
                  :          "text-ink hover:bg-canvas",
                ].join(" ")}>
                {d.getDate()}
              </button>
            </div>
          );
        })}
      </div>

      {/* Time picker — AM/PM spinners */}
      <div className="border-t border-rule pt-3">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-muted">Time</label>
        <div className="flex items-center justify-center gap-2">
          {/* Hour */}
          <div className="flex flex-col items-center gap-1">
            <button type="button" onClick={() => {
              const next = hour12 === 12 ? 1 : hour12 + 1;
              setHour12(next); applyTime(next, minute, ampm);
            }} className="flex h-7 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas hover:text-ink transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M18 15l-6-6-6 6"/></svg>
            </button>
            <div className="flex h-11 w-12 items-center justify-center rounded-xl border border-rule bg-canvas text-xl font-bold tabular-nums text-ink">
              {String(hour12).padStart(2,"0")}
            </div>
            <button type="button" onClick={() => {
              const next = hour12 === 1 ? 12 : hour12 - 1;
              setHour12(next); applyTime(next, minute, ampm);
            }} className="flex h-7 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas hover:text-ink transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
          <span className="text-2xl font-bold text-ink-muted pb-1">:</span>
          {/* Minute */}
          <div className="flex flex-col items-center gap-1">
            <button type="button" onClick={() => {
              const next = (minute + 5) % 60;
              setMinute(next); applyTime(hour12, next, ampm);
            }} className="flex h-7 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas hover:text-ink transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M18 15l-6-6-6 6"/></svg>
            </button>
            <div className="flex h-11 w-12 items-center justify-center rounded-xl border border-rule bg-canvas text-xl font-bold tabular-nums text-ink">
              {String(minute).padStart(2,"0")}
            </div>
            <button type="button" onClick={() => {
              const next = (minute + 55) % 60;
              setMinute(next); applyTime(hour12, next, ampm);
            }} className="flex h-7 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas hover:text-ink transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
          {/* AM / PM toggle */}
          <div className="flex flex-col gap-1 pb-1">
            {(["AM","PM"] as const).map((p) => (
              <button key={p} type="button"
                onClick={() => { setAmpm(p); applyTime(hour12, minute, p); }}
                className={[
                  "flex h-[46px] w-12 items-center justify-center rounded-xl border text-xs font-bold transition",
                  ampm === p
                    ? "border-brand bg-brand text-white"
                    : "border-rule bg-canvas text-ink-muted hover:border-brand/40 hover:text-brand",
                ].join(" ")}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {selDate && (
          <p className="mt-3 text-center text-xs text-ink-muted">
            {selDate.toLocaleDateString("en-AE", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} at {String(hour12).padStart(2,"0")}:{String(minute).padStart(2,"0")} {ampm}
          </p>
        )}
      </div>
    </div>
  );
}

// ── WhatsApp preview ───────────────────────────────────────────────────────

function useWaProfile() {
  const [profile, setProfile] = useState<{ name: string; picture: string | null }>({ name: "Business account", picture: null });
  useEffect(() => {
    fetch("/api/wa/profile").then(r => r.json()).then(j => {
      if (j.ok && j.data) setProfile({
        name:    j.data.verified_name       || "Business account",
        picture: j.data.profile_picture_url ?? null,
      });
    }).catch(() => {});
  }, []);
  return profile;
}

function WAPreview({ template, imageUrl }: { template: Template; imageUrl?: string }) {
  const profile = useWaProfile();
  const header = getComp(template, "HEADER");
  const body = getComp(template, "BODY");
  const footer = getComp(template, "FOOTER");
  const buttons = getComp(template, "BUTTONS")?.buttons ?? [];
  const [time, setTime] = useState("12:00 AM");
  useEffect(() => { setTime(new Date().toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" })); }, []);

  return (
    <div className="overflow-hidden rounded-2xl bg-[#ECE5DD]">
      {/* WA-style header bar */}
      <div className="flex items-center gap-2 bg-[#075E54] px-3 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={profile.picture ?? "/uploads/logo.png"} alt={profile.name} className="h-7 w-7 rounded-full object-cover bg-white ring-2 ring-white/40" />
        <div>
          <p className="text-[10px] font-semibold text-white leading-tight">{profile.name}</p>
          <p className="text-[8px] text-white/60">Business account</p>
        </div>
      </div>
      <div className="p-3">
      <div className="overflow-hidden rounded-xl rounded-tl-sm bg-white ring-1 ring-black/5">
        {header?.format === "IMAGE" && (
          imageUrl
            ? <img src={imageUrl} alt="header" className="w-full max-h-40 object-cover" /> // eslint-disable-line @next/next/no-img-element
            : <div className="flex h-24 flex-col items-center justify-center gap-1.5 bg-gray-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <p className="text-[10px] text-gray-400">Image header</p>
              </div>
        )}
        {(header?.format === "VIDEO" || header?.format === "DOCUMENT") && (
          <div className="flex h-24 flex-col items-center justify-center gap-1.5 bg-gray-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            <p className="text-[10px] text-gray-400">{header.format.charAt(0) + header.format.slice(1).toLowerCase()} header</p>
          </div>
        )}
        {header?.format === "TEXT" && header.text && (
          <div className="bg-[#128C7E] px-3 py-2.5">
            <p className="text-sm font-semibold text-white">{header.text}</p>
          </div>
        )}
        <div className="px-3 py-2.5">
          {body?.text
            ? <p className="whitespace-pre-wrap text-sm text-gray-800">{body.text}</p>
            : <p className="text-sm italic text-gray-400">No body text</p>}
          {footer?.text && <p className="mt-2 text-xs text-gray-400">{footer.text}</p>}
          <p className="mt-1.5 text-right text-[10px] text-gray-400">{time} ✓✓</p>
        </div>
        {buttons.length > 0 && (
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {buttons.map((b, i) => (
              <p key={i} className="px-3 py-2 text-center text-sm font-semibold text-[#128C7E]">{b.text}</p>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

function TemplatesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Support legacy ?customers= URL param (coming back from /customers page)
  const customerParam = searchParams.get("customers") ?? "";
  const [preselected, setPreselected] = useState<string[]>(() =>
    customerParam ? customerParam.split(",").filter(Boolean) : []
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Template | null>(null);
  const [sending, setSending]         = useState(false);
  const [result, setResult]           = useState<CampaignResult | null>(null);
  const [search, setSearch]           = useState("");
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt]   = useState("");
  const [scheduling, setScheduling]     = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);

  // Per-campaign inputs
  const [imageUrl, setImageUrl] = useState("");
  const [extraBodyVars, setExtraBodyVars] = useState<string[]>([]); // values for {{2}}, {{3}} ...
  const [urlSuffix, setUrlSuffix] = useState("");
  const [couponCode, setCouponCode] = useState("");

  useEffect(() => {
    fetch("/api/bot/templates")
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Failed");
        const list: Template[] = json.data;
        setTemplates(list);
        // Restore all form state if user just came back from /customers
        const savedId = sessionStorage.getItem("wa_selected_template");
        if (savedId && preselected.length > 0) {
          const match = list.find((t) => t.id === savedId);
          if (match) {
            setSelected(match);
            const savedForm = sessionStorage.getItem("wa_campaign_form");
            if (savedForm) {
              try {
                const f = JSON.parse(savedForm);
                if (f.imageUrl)      setImageUrl(f.imageUrl);
                if (f.urlSuffix)     setUrlSuffix(f.urlSuffix);
                if (f.couponCode)    setCouponCode(f.couponCode);
                if (f.extraBodyVars) setExtraBodyVars(f.extraBodyVars);
              } catch { /* ignore */ }
              sessionStorage.removeItem("wa_campaign_form");
            }
          }
          sessionStorage.removeItem("wa_selected_template");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTemplate(t: Template) {
    setSelected((p) => p?.id === t.id ? null : t);
    setImageUrl("");
    setExtraBodyVars([]);
    setUrlSuffix("");
    setCouponCode("");
    setResult(null);
    setError(null);
    setScheduleSuccess(null);
    setScheduleMode(false);
    setScheduledAt("");
  }

  async function sendCampaign() {
    if (!selected || preselected.length === 0) return;
    if (hasImageHeader(selected) && !imageUrl.trim()) {
      setError("Please paste a public image URL for the header.");
      return;
    }
    const dynUrl = getDynamicUrlButton(selected);
    if (dynUrl && !urlSuffix.trim()) {
      setError(`Please fill in the URL for button "${dynUrl.btn.text}".`);
      return;
    }
    const coupon = getCouponButton(selected);
    if (coupon && !couponCode.trim()) {
      setError(`Please fill in the coupon code for button "${coupon.btn.text}".`);
      return;
    }

    setSending(true); setResult(null); setError(null);
    try {
      const bv = countBodyVars(selected);
      const campaignName = `${selected.name} — ${new Date().toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })}`;
      const res = await fetch("/api/bot/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customers: preselected,
          templateName: selected.name,
          templateLanguage: selected.language,
          campaignName,
          // Image header
          imageUrl: hasImageHeader(selected) ? imageUrl.trim() : undefined,
          headerFormat: getComp(selected, "HEADER")?.format,
          // Body variables
          bodyVarCount: bv,
          // extraBodyVars covers {{2}}, {{3}} etc — {{1}} is auto-filled with customer name
          extraBodyVars: extraBodyVars.map((v) => v.trim()),
          // Dynamic URL button
          urlSuffix: dynUrl ? urlSuffix.trim() : undefined,
          urlButtonIndex: dynUrl?.idx,
          // Coupon code button
          couponCode: coupon ? couponCode.trim() : undefined,
          couponButtonIndex: coupon?.idx,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setResult(json.data);
      // Redirect to broadcast detail if we have an ID, otherwise list
      const dest = json.data?.broadcastId ? `/wa/campaigns/${json.data.broadcastId}` : "/wa/campaigns";
      setTimeout(() => router.push(dest), 1800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally { setSending(false); }
  }

  async function scheduleCampaign() {
    if (!selected || preselected.length === 0) return;
    if (!scheduledAt) { setError("Please pick a date and time to schedule."); return; }
    if (new Date(scheduledAt) <= new Date()) { setError("Schedule time must be in the future."); return; }
    if (hasImageHeader(selected) && !imageUrl.trim()) { setError("Please paste a public image URL for the header."); return; }
    const dynUrl = getDynamicUrlButton(selected);
    if (dynUrl && !urlSuffix.trim()) { setError(`Please fill in the URL for button "${dynUrl.btn.text}".`); return; }
    const coupon = getCouponButton(selected);
    if (coupon && !couponCode.trim()) { setError(`Please fill in the coupon code for button "${coupon.btn.text}".`); return; }

    setScheduling(true); setError(null); setScheduleSuccess(null);
    try {
      const bv  = countBodyVars(selected);
      const res = await fetch("/api/bot/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customers:        preselected,
          templateName:     selected.name,
          templateLanguage: selected.language,
          sendAt:           new Date(scheduledAt).toISOString(),
          imageUrl:         hasImageHeader(selected) ? imageUrl.trim() : undefined,
          headerFormat:     getComp(selected, "HEADER")?.format,
          bodyVarCount:     bv,
          extraBodyVars:    extraBodyVars.map((v) => v.trim()),
          urlSuffix:        dynUrl ? urlSuffix.trim() : undefined,
          urlButtonIndex:   dynUrl?.idx,
          couponCode:       coupon ? couponCode.trim() : undefined,
          couponButtonIndex:coupon?.idx,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const when = new Date(scheduledAt).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" });
      setScheduleSuccess(`Campaign scheduled for ${when} — ${preselected.length} recipient${preselected.length !== 1 ? "s" : ""}.`);
      setScheduleMode(false);
      setScheduledAt("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to schedule");
    } finally { setScheduling(false); }
  }

  const filtered = templates.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase()),
  );

  // Derived from selected template
  const bvCount = selected ? countBodyVars(selected) : 0;
  // Extra vars = {{2}} onwards ({{1}} is auto customer name)
  const extraVarCount = bvCount > 1 ? bvCount - 1 : 0;
  const dynUrl = selected ? getDynamicUrlButton(selected) : null;
  const coupon = selected ? getCouponButton(selected) : null;
  const hasAnyInput = selected && (hasImageHeader(selected) || extraVarCount > 0 || !!dynUrl || !!coupon);



  return (
    <>
    <CustomerPickerModal
      open={pickerOpen}
      initial={preselected}
      onClose={() => setPickerOpen(false)}
      onApply={(ids) => { setPreselected(ids); }}
    />
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="px-6 py-4 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12.5px] text-[#64748b]">Pick an approved template and send it to your selected customers.</p>
          {preselected.length > 0 && (
            <button onClick={() => setPickerOpen(true)}
              className="flex items-center gap-3 rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 px-4 py-2.5 transition hover:bg-[#25D366]/10">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#25D366] text-xs font-bold text-white">{preselected.length}</div>
              <span className="text-sm font-medium text-[#075E54]">{preselected.length} customer{preselected.length !== 1 ? "s" : ""} selected</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="#075E54" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="ml-1 h-3.5 w-3.5 opacity-60"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      <div className="px-6 lg:px-8">
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>{error}</span>
          </div>
        )}
        {result && (
          <div className={["mt-4 rounded-xl border px-4 py-3", result.failed === 0 ? "border-success/30 bg-success/5" : "border-amber-200 bg-amber-50"].join(" ")}>
            <div className="flex items-center gap-3">
              {result.sent > 0 && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M20 6L9 17l-5-5"/></svg>
                  {result.sent} sent
                </span>
              )}
              {result.failed > 0 && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-danger">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  {result.failed} failed
                </span>
              )}
            </div>
            {result.results.filter((r) => r.error).map((r, i) => (
              <p key={i} className="mt-1.5 text-xs text-ink-muted">{r.wa_id}: {r.error}</p>
            ))}
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col gap-0 lg:flex-row lg:divide-x lg:divide-rule">

        {/* Left: template list */}
        <div className="flex-1 min-w-0 px-6 py-6 lg:px-8">
          <div className="pb-4 mb-4 border-b border-[#e5e7eb] flex items-center gap-3">
            <div className="relative flex-1">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="search" placeholder="Search templates…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-full rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] pl-8 pr-3 text-[13px] text-[#0f172a] placeholder:text-[#9ca3af] focus:bg-white focus:outline-none transition" />
            </div>
            <span className="shrink-0 text-[12px] text-[#9ca3af]">{filtered.length} template{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {loading ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-[#f1f5f9]" />
            )) : filtered.length === 0 ? (
              <div className="col-span-2 rounded-xl border border-dashed border-[#e5e7eb] bg-white py-14 text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 h-8 w-8 text-[#cbd5e1]"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                <p className="text-sm font-medium text-[#0f172a]">No approved templates</p>
                <p className="mt-1 text-xs text-[#64748b]">Go to Manage Templates to create one.</p>
                <button onClick={() => router.push("/wa/manage")} className="mt-3 rounded-lg border border-[#e5e7eb] px-4 py-1.5 text-xs font-medium text-[#0f172a] hover:bg-[#f6f8fa] transition">
                  Manage Templates →
                </button>
              </div>
            ) : filtered.map((t) => {
              const isActive = selected?.id === t.id;
              const body = getComp(t, "BODY");
              const needsImg = hasImageHeader(t);
              const bv = countBodyVars(t);
              const btnCount = getComp(t, "BUTTONS")?.buttons?.length ?? 0;
              const catColor: Record<string, string> = {
                MARKETING: "text-purple-600", UTILITY: "text-blue-600", AUTHENTICATION: "text-amber-600",
              };
              return (
                <button key={t.id} onClick={() => selectTemplate(t)}
                  className={[
                    "group relative w-full rounded-xl border text-left transition-colors duration-100",
                    isActive ? "border-[#0f172a] bg-white" : "border-[#e5e7eb] bg-[#f8fafc] hover:border-[#94a3b8] hover:bg-white",
                  ].join(" ")}
                >
                  {/* Selected indicator strip */}
                  {isActive && <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-[#25D366]" />}

                  <div className="px-5 py-4">
                    {/* Row 1: category + radio */}
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className={["text-[10px] font-bold uppercase tracking-widest", catColor[t.category] ?? "text-[#64748b]"].join(" ")}>
                        {t.category}
                      </span>
                      <div className={[
                        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        isActive ? "border-[#25D366] bg-[#25D366]" : "border-[#d1d5db] group-hover:border-[#94a3b8]",
                      ].join(" ")}>
                        {isActive && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5"><path d="M20 6L9 17l-5-5"/></svg>}
                      </div>
                    </div>

                    {/* Row 2: name */}
                    <div className="mb-1.5 flex items-center gap-1.5 min-w-0">
                      {needsImg && <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>}
                      <p className="text-[13.5px] font-semibold text-[#0f172a] truncate">{t.name}</p>
                    </div>

                    {/* Row 3: body preview */}
                    <p className="line-clamp-2 text-[12px] leading-[1.6] text-[#64748b]">
                      {body?.text?.slice(0, 100) ?? "No body text"}
                    </p>

                    {/* Row 4: meta chips */}
                    {(bv > 0 || btnCount > 0) && (
                      <div className="mt-3 flex items-center gap-1.5">
                        {bv > 0 && <span className="rounded-md bg-[#fefce8] border border-[#fde68a] px-2 py-0.5 text-[10px] font-semibold text-[#92400e]">{bv} var{bv !== 1 ? "s" : ""}</span>}
                        {btnCount > 0 && <span className="rounded-md bg-[#f6f8fa] border border-[#e5e7eb] px-2 py-0.5 text-[10px] font-semibold text-[#64748b]">{btnCount} btn{btnCount !== 1 ? "s" : ""}</span>}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: preview + inputs + send */}
        <div className="w-full shrink-0 lg:w-[380px]">
          <div className="sticky top-[57px] px-6 pt-6 pb-6 lg:px-8 -mt-6">
            {selected ? (
              <div className="space-y-4">
                {/* ── Campaign details ── */}
                {hasAnyInput ? (
                  <div className="rounded-2xl border border-rule bg-white overflow-hidden">
                    <div className="border-b border-rule bg-canvas px-4 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Campaign details</p>
                    </div>
                    <div className="space-y-4 p-4">

                      {/* Image URL */}
                      {hasImageHeader(selected) && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-ink">Header Image URL <span className="text-danger">*</span></label>
                          <input type="url" value={imageUrl} placeholder="https://example.com/images/offer.jpg"
                            onChange={(e) => setImageUrl(e.target.value)} className={inputCls} />
                          <p className="mt-1 text-[11px] text-ink-muted">Direct JPG/PNG link from your website.</p>
                        </div>
                      )}

                      {/* {{1}} = customer name — automatic, shown as info only */}
                      {bvCount >= 1 && (
                        <div className="flex items-center gap-2.5 rounded-lg border border-[#25D366]/30 bg-[#25D366]/5 px-3 py-2.5">
                          <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          <div>
                            <p className="text-xs font-medium text-[#075E54]">&#123;&#123;1&#125;&#125; = Customer name — auto filled</p>
                            <p className="text-[11px] text-[#075E54]/70">Each customer receives their own name from your database.</p>
                          </div>
                        </div>
                      )}

                      {/* Extra body vars {{2}}, {{3}} etc */}
                      {extraVarCount > 0 && Array.from({ length: extraVarCount }, (_, i) => (
                        <div key={i}>
                          <label className="mb-1 block text-xs font-medium text-ink">&#123;&#123;{i + 2}&#125;&#125; — body variable</label>
                          <input type="text"
                            value={extraBodyVars[i] ?? ""}
                            placeholder={`Value for {{${i + 2}}}`}
                            onChange={(e) => {
                              const next = [...extraBodyVars];
                              next[i] = e.target.value;
                              setExtraBodyVars(next);
                            }}
                            className={inputCls}
                          />
                        </div>
                      ))}

                      {/* Dynamic URL button */}
                      {dynUrl && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-ink">
                            Button &ldquo;{dynUrl.btn.text}&rdquo; — URL suffix <span className="text-danger">*</span>
                          </label>
                          <div className="flex w-full overflow-hidden rounded-lg border border-rule focus-within:border-[#25D366] focus-within:ring-2 focus-within:ring-[#25D366]/20">
                            <span className="flex shrink-0 items-center border-r border-rule bg-canvas px-3 py-2 text-xs text-ink-muted max-w-[140px] truncate">
                              {dynUrl.btn.url?.replace(/\{\{1\}\}.*$/, "")}
                            </span>
                            <input type="text" value={urlSuffix} placeholder="e.g. summer-sale"
                              onChange={(e) => setUrlSuffix(e.target.value.replace(/^\/+/, ""))}
                              className="min-w-0 flex-1 bg-white px-3 py-2 text-sm text-ink focus:outline-none" />
                          </div>
                        </div>
                      )}

                      {/* Coupon code button */}
                      {coupon && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-ink">
                            Button &ldquo;{coupon.btn.text}&rdquo; — Coupon code <span className="text-danger">*</span>
                          </label>
                          <input type="text" value={couponCode} placeholder="e.g. SAVE20"
                            onChange={(e) => setCouponCode(e.target.value)} className={inputCls} />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 px-4 py-3">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                    <span className="text-sm text-[#075E54]">Template sends exactly as approved — no extra input needed.</span>
                  </div>
                )}

                {/* Send / Schedule buttons */}
                <div className="space-y-2 pt-1">
                  {preselected.length === 0 ? (
                    <button
                      onClick={() => setPickerOpen(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#25D366]/40 py-3.5 text-sm font-medium text-[#075E54]/70 transition hover:border-[#25D366] hover:text-[#075E54] hover:bg-[#25D366]/5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                      Select customers
                    </button>
                  ) : scheduleSuccess ? (
                    <div className="rounded-xl border border-[#075E54]/20 bg-[#075E54]/5 p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#075E54]/10">
                          <svg viewBox="0 0 24 24" fill="none" stroke="#075E54" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M20 6L9 17l-5-5"/></svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#075E54]">Campaign scheduled</p>
                          <p className="mt-0.5 text-xs text-[#075E54]/70">{scheduleSuccess}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => router.push("/wa/campaigns?tab=scheduled")}
                        className="w-full rounded-xl border border-[#075E54]/30 bg-white py-2.5 text-sm font-semibold text-[#075E54] transition hover:bg-[#075E54]/5"
                      >
                        <span className="flex items-center justify-center gap-2">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                          </svg>
                          View scheduled campaigns
                        </span>
                      </button>
                    </div>
                  ) : (
                    <>
                      {scheduleMode && (
                        <div className="space-y-3">
                          <SchedulePicker value={scheduledAt} onChange={setScheduledAt} />
                          <button
                            onClick={scheduleCampaign}
                            disabled={scheduling || !scheduledAt}
                            className="w-full rounded-xl bg-[#075E54] py-3 text-sm font-semibold text-white transition hover:bg-[#054d44] disabled:opacity-60"
                          >
                            {scheduling ? (
                              <span className="flex items-center justify-center gap-2">
                                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                                Scheduling…
                              </span>
                            ) : (
                              <span className="flex items-center justify-center gap-2">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>
                                </svg>
                                Confirm Schedule · {preselected.length} recipient{preselected.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </button>
                        </div>
                      )}
                      {!scheduleMode && (
                        <button onClick={sendCampaign} disabled={sending || scheduling}
                          className="relative w-full overflow-hidden rounded-xl bg-[#25D366] py-3.5 text-sm font-semibold text-white transition hover:bg-[#128C7E] disabled:opacity-60 active:scale-[0.98]">
                          {sending ? (
                            <span className="flex items-center justify-center gap-2">
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                              Sending to {preselected.length} customer{preselected.length !== 1 ? "s" : ""}…
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                              Send now · {preselected.length} recipient{preselected.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => { setScheduleMode((m) => !m); setError(null); setScheduledAt(""); }}
                        disabled={sending || scheduling}
                        className={[
                          "w-full rounded-xl border py-3 text-sm font-semibold transition",
                          scheduleMode
                            ? "border-[#075E54]/30 bg-[#075E54]/5 text-[#075E54]"
                            : "border-rule bg-canvas text-ink-muted hover:border-[#075E54]/30 hover:text-[#075E54]",
                        ].join(" ")}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                          </svg>
                          {scheduleMode ? "Cancel scheduling" : "Schedule for later"}
                        </span>
                      </button>
                    </>
                  )}
                </div>

                {/* Preview — at the bottom */}
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">Preview</p>
                  <WAPreview template={selected} imageUrl={imageUrl || undefined} />
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#25D366]/10">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                </div>
                <p className="text-sm font-medium text-ink">Select a template</p>
                <p className="mt-1 text-xs text-ink-muted">Click any template on the left to preview and send.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center text-sm text-ink-muted">Loading templates…</div>}>
      <TemplatesContent />
    </Suspense>
  );
}
