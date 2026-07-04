"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

type Customer = {
  wa_id: string;
  name: string;
  language: string;
  first_seen: string;
  last_seen: string;
  total_messages: number;
  tags: string[];
};

const TAG_COLORS = [
  "bg-purple-50 text-purple-700 border-purple-200",
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-indigo-50 text-indigo-700 border-indigo-200",
];

function tagColor(tag: string) {
  let n = 0;
  for (let i = 0; i < tag.length; i++) n += tag.charCodeAt(i);
  return TAG_COLORS[n % TAG_COLORS.length];
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Inline tag editor ──────────────────────────────────────────────────────

function TagEditor({ waId, tags, allTags, onSaved }: {
  waId: string; tags: string[]; allTags: string[]; onSaved: (tags: string[]) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [input, setInput]   = useState("");
  const [saving, setSaving] = useState(false);
  const [local, setLocal]   = useState(tags);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocal(tags); }, [tags]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function save(next: string[]) {
    setSaving(true);
    try {
      const res = await fetch("/api/bot/customers/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wa_id: waId, tags: next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setLocal(json.data.tags);
      onSaved(json.data.tags);
    } finally { setSaving(false); }
  }

  function addTag(tag: string) {
    const t = tag.toLowerCase().trim();
    if (!t || local.includes(t)) return;
    const next = [...local, t];
    setLocal(next);
    save(next);
    setInput("");
  }

  function removeTag(tag: string) {
    const next = local.filter((t) => t !== tag);
    setLocal(next);
    save(next);
  }

  const suggestions = allTags.filter((t) => !local.includes(t) && (!input || t.includes(input.toLowerCase())));

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-1">
        {local.map((t) => (
          <span key={t} className={["inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", tagColor(t)].join(" ")}>
            {t}
            <button onClick={() => removeTag(t)} className="opacity-50 hover:opacity-100 transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </span>
        ))}
        <button onClick={() => setOpen((v) => !v)}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-rule text-ink-muted hover:border-[#25D366] hover:text-[#25D366] transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        {saving && <svg className="h-3 w-3 animate-spin text-ink-muted" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
      </div>

      {open && (
        <div className="absolute left-0 top-7 z-30 w-52 rounded-xl border border-rule bg-white">
          <div className="p-2">
            <input autoFocus type="text" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(input); } }}
              placeholder="Type and press Enter…"
              className="w-full rounded-lg border border-rule bg-canvas px-2.5 py-1.5 text-xs focus:border-[#25D366] focus:outline-none focus:ring-1 focus:ring-[#25D366]/20" />
          </div>
          {suggestions.length > 0 && (
            <div className="border-t border-rule p-1.5">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Existing tags</p>
              {suggestions.slice(0, 8).map((t) => (
                <button key={t} onClick={() => addTag(t)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-cream/60 transition">
                  <span className={["rounded-full border px-2 py-0.5 text-[10px] font-medium", tagColor(t)].join(" ")}>{t}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [query, setQuery]         = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [allTags, setAllTags]     = useState<string[]>([]);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef     = useRef<HTMLInputElement>(null);

  const fetchCustomers = useCallback((q: string, tag: string) => {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tag) params.set("tag", tag);
    fetch(`/api/bot/customers?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Failed");
        setCustomers(json.data);
        setSelected(new Set());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const fetchTags = useCallback(() => {
    fetch("/api/bot/customers/tags")
      .then((r) => r.json())
      .then((json) => { if (json.ok) setAllTags(json.data); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchCustomers("", ""); fetchTags(); }, [fetchCustomers, fetchTags]);

  function onSearch(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCustomers(val, tagFilter), 350);
  }

  function onTagFilter(tag: string) {
    const next = tag === tagFilter ? "" : tag;
    setTagFilter(next);
    fetchCustomers(query, next);
  }

  function toggleAll() {
    setSelected(selected.size === customers.length ? new Set() : new Set(customers.map((c) => c.wa_id)));
  }

  function toggleOne(waId: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(waId) ? n.delete(waId) : n.add(waId); return n; });
  }

  function updateCustomerTags(waId: string, tags: string[]) {
    setCustomers((prev) => prev.map((c) => c.wa_id === waId ? { ...c, tags } : c));
    fetchTags();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/bot/customers/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setImportMsg(`Imported ${json.data.inserted} customers`);
      fetchCustomers(query, tagFilter);
    } catch (e: unknown) {
      setImportMsg(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const allSelected  = customers.length > 0 && selected.size === customers.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="px-6 py-5 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">Customers</h1>
            <p className="mt-0.5 text-sm text-ink-muted">WhatsApp contacts from Bot</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="search" placeholder="Search name or number…" value={query} onChange={(e) => onSearch(e.target.value)}
                className="w-56 rounded-lg border border-rule bg-canvas py-2 pl-9 pr-3 text-sm focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20" />
            </div>
            <label className={["inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rule bg-white px-3 py-2 text-sm font-medium text-ink-muted hover:bg-cream/60 transition", importing ? "pointer-events-none opacity-60" : ""].join(" ")}>
              <IconUpload className="h-4 w-4" />
              {importing ? "Importing…" : "Import CSV"}
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
            </label>
            <button onClick={() => window.open("/api/bot/customers/export", "_blank")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-white px-3 py-2 text-sm font-medium text-ink-muted hover:bg-cream/60 transition">
              <IconDownload className="h-4 w-4" />
              Export CSV
            </button>
            {selected.size > 0 && (
              <Link href={`/wa/templates?customers=${[...selected].map(encodeURIComponent).join(",")}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-white hover:bg-[#128C7E] transition">
                <IconSendIcon className="h-4 w-4" />
                Send Campaign ({selected.size})
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-6 py-2.5 lg:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Filter by tag:</p>
          {allTags.map((t) => (
            <button key={t} onClick={() => onTagFilter(t)}
              className={["rounded-full border px-2.5 py-0.5 text-xs font-medium transition", tagFilter === t ? [tagColor(t), "ring-1 ring-current"].join(" ") : "border-rule bg-canvas text-ink-muted hover:border-[#25D366]/40"].join(" ")}>
              {t}
            </button>
          ))}
          {tagFilter && (
            <button onClick={() => onTagFilter("")} className="ml-1 text-xs text-ink-muted hover:text-danger transition">
              Clear filter
            </button>
          )}
        </div>
      )}

      <div className="px-6 py-5 lg:px-8">
        {/* Alerts */}
        {importMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-2.5 text-sm text-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
            {importMsg}
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {error}
          </div>
        )}

        {/* Selection bar */}
        {selected.size > 0 && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 px-4 py-2.5 text-sm">
            <span className="font-medium text-[#075E54]">{selected.size} customer{selected.size !== 1 ? "s" : ""} selected</span>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-ink-muted hover:text-ink">Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-rule bg-white">
          <table className="min-w-full divide-y divide-rule text-sm">
            <thead className="bg-canvas">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleAll} className="h-4 w-4 rounded border-rule accent-[#25D366]" />
                </th>
                {["Name", "Phone", "Tags", "Language", "Messages", "First seen", "Last seen", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-cream/60" /></td>
                  ))}</tr>
                ))
              ) : customers.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-ink-muted">No customers found.</td></tr>
              ) : customers.map((c) => {
                const isSelected = selected.has(c.wa_id);
                return (
                  <tr key={c.wa_id} onClick={() => toggleOne(c.wa_id)}
                    className={["cursor-pointer transition-colors", isSelected ? "bg-[#25D366]/5" : "hover:bg-cream/30"].join(" ")}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleOne(c.wa_id)} className="h-4 w-4 rounded border-rule accent-[#25D366]" />
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {c.name || <span className="italic text-ink-muted">Unknown</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-muted">{c.wa_id}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <TagEditor
                        waId={c.wa_id}
                        tags={c.tags ?? []}
                        allTags={allTags}
                        onSaved={(tags) => updateCustomerTags(c.wa_id, tags)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-cream px-2 py-0.5 text-xs font-medium text-ink">{c.language || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-ink">{c.total_messages ?? 0}</td>
                    <td className="px-4 py-3 text-ink-muted">{fmtDate(c.first_seen)}</td>
                    <td className="px-4 py-3 text-ink-muted">{fmtDate(c.last_seen)}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Link href={`/customers/${encodeURIComponent(c.wa_id)}`} className="text-xs font-medium text-brand hover:underline">
                        History →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && customers.length > 0 && (
          <p className="mt-3 text-right text-xs text-ink-muted">
            {customers.length} customer{customers.length !== 1 ? "s" : ""}
            {selected.size > 0 && ` · ${selected.size} selected`}
            {tagFilter && ` · filtered by "${tagFilter}"`}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function IconUpload(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconDownload(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconSendIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
