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
  "bg-blue-50 text-blue-700 border-indigo-200",
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
              className="w-full rounded-lg border border-rule bg-[#f6f8fa] px-2.5 py-1.5 text-xs focus:border-[#25D366] focus:outline-none focus:ring-1 focus:ring-[#25D366]/20" />
          </div>
          {suggestions.length > 0 && (
            <div className="border-t border-rule p-1.5">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Existing tags</p>
              {suggestions.slice(0, 8).map((t) => (
                <button key={t} onClick={() => addTag(t)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-[#f6f8fa] transition">
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
  const [sheetsReady, setSheetsReady] = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [syncMsg, setSyncMsg]         = useState<{ ok: boolean; text: string; url?: string } | null>(null);
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
        setCustomers(json.data.customers ?? json.data);
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

  useEffect(() => {
    fetchCustomers("", "");
    fetchTags();
    // Check if Google Sheets is connected
    fetch("/api/admin/integrations/google/sheets")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setSheetsReady(j.data.connected && !!j.data.sheetId); })
      .catch(() => {});
  }, [fetchCustomers, fetchTags]);

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

  async function handleSyncSheets() {
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await fetch("/api/admin/customers/export-sheets", { method: "POST" }).then((r) => r.json());
      if (r.ok) setSyncMsg({ ok: true, text: `${r.data.count} contacts synced to Google Sheets`, url: r.data.sheetUrl });
      else setSyncMsg({ ok: false, text: r.error ?? "Sync failed" });
    } catch {
      setSyncMsg({ ok: false, text: "Sync failed — check your connection" });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
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
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="px-6 py-4 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12.5px] text-[#64748b]">WhatsApp contacts from Bot</p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="search" placeholder="Search name or number…" value={query} onChange={(e) => onSearch(e.target.value)}
                className="h-8 w-52 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] pl-8 pr-3 text-[13px] text-[#0f172a] placeholder:text-[#9ca3af] focus:bg-white focus:outline-none transition" />
            </div>

            {/* Divider */}
            <div className="h-5 w-px bg-[#e5e7eb]" />

            {/* Import CSV */}
            <label className={["inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#f6f8fa] transition", importing ? "pointer-events-none opacity-50" : ""].join(" ")}>
              <IconUpload className="h-3.5 w-3.5 text-[#6b7280]" />
              {importing ? "Importing…" : "Import CSV"}
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
            </label>

            {/* Export CSV */}
            <button onClick={() => window.open("/api/bot/customers/export", "_blank")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#f6f8fa] transition">
              <IconDownload className="h-3.5 w-3.5 text-[#6b7280]" />
              Export CSV
            </button>

            {/* Sync to Sheets */}
            {sheetsReady && (
              <button onClick={handleSyncSheets} disabled={syncing}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#34a853]/30 bg-[#f0faf4] px-3 text-[13px] font-medium text-[#1e7e34] hover:bg-[#dcf5e5] transition disabled:opacity-50">
                {syncing ? (
                  <><svg className="h-3.5 w-3.5 animate-spin text-[#6b7280]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Syncing…</>
                ) : (
                  <><IconSheets className="h-3.5 w-3.5" />Sync to Sheets</>
                )}
              </button>
            )}

            {/* Send Campaign */}
            {selected.size > 0 && (
              <Link href={`/wa/templates?customers=${[...selected].map(encodeURIComponent).join(",")}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-[13px] font-semibold text-white hover:bg-[#1DA851] transition">
                <IconSendIcon className="h-3.5 w-3.5" />
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
              className={["rounded-full border px-2.5 py-0.5 text-xs font-medium transition", tagFilter === t ? [tagColor(t), "ring-1 ring-current"].join(" ") : "border-rule bg-[#f6f8fa] text-ink-muted hover:border-[#25D366]/40"].join(" ")}>
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
        {syncMsg && (
          <div className={["mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm", syncMsg.ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-600"].join(" ")}>
            <div className="flex items-center gap-2">
              {syncMsg.ok
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>}
              {syncMsg.text}
            </div>
            {syncMsg.url && (
              <a href={syncMsg.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-semibold underline underline-offset-2">
                Open Sheet →
              </a>
            )}
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
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-[#25D366]/30 bg-[#f0fdf4] px-4 py-2.5 text-sm">
            <span className="font-medium text-[#075E54]">{selected.size} customer{selected.size !== 1 ? "s" : ""} selected</span>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-ink-muted hover:text-ink">Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-rule bg-white">
          <table className="min-w-full divide-y divide-rule text-sm">
            <thead className="bg-[#f6f8fa]">
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
                    className={["cursor-pointer transition-colors", isSelected ? "bg-[#f0fdf4]" : "hover:bg-[#f6f8fa]"].join(" ")}>
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
                      <span className="inline-flex items-center rounded-full bg-[#f1f5f9] px-2 py-0.5 text-xs font-medium text-ink">{c.language || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-ink">{c.total_messages ?? 0}</td>
                    <td className="px-4 py-3 text-ink-muted">{fmtDate(c.first_seen)}</td>
                    <td className="px-4 py-3 text-ink-muted">{fmtDate(c.last_seen)}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Link href={`/wa/inbox?waId=${encodeURIComponent(c.wa_id)}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#25D366] hover:underline">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                        Open Chat
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && customers.length > 0 && selected.size > 0 && (
          <p className="mt-3 text-right text-xs text-ink-muted">
            {selected.size} selected{tagFilter && ` · filtered by "${tagFilter}"`}
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

function IconSheets(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
    </svg>
  );
}
