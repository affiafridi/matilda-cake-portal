"use client";

import { useState, useEffect } from "react";

type Category = {
  wc_id: number;
  name: string;
  enabled: boolean;
  sort_order: number;
};

// ── Drag handle icon ──────────────────────────────────────────────────────────
function DragHandle() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-ink-muted/40 group-hover:text-ink-muted transition-colors cursor-grab active:cursor-grabbing">
      <circle cx="7" cy="5"  r="1.5"/><circle cx="13" cy="5"  r="1.5"/>
      <circle cx="7" cy="10" r="1.5"/><circle cx="13" cy="10" r="1.5"/>
      <circle cx="7" cy="15" r="1.5"/><circle cx="13" cy="15" r="1.5"/>
    </svg>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
        checked ? "bg-[#7f54b3]" : "bg-rule",
      ].join(" ")}
    >
      <span className={[
        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200",
        checked ? "translate-x-4" : "translate-x-0",
      ].join(" ")} />
    </button>
  );
}

// ── Category row ──────────────────────────────────────────────────────────────
function CategoryRow({
  cat, index, onToggle, onDragStart, onDragOver, onDrop, dragging,
}: {
  cat: Category; index: number;
  onToggle: () => void;
  onDragStart: (i: number) => void;
  onDragOver:  (e: React.DragEvent, i: number) => void;
  onDrop:      (i: number) => void;
  dragging:    number | null;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, index); }}
      onDrop={() => onDrop(index)}
      className={[
        "group flex items-center gap-3 rounded-xl border bg-white px-4 py-3 transition select-none",
        dragging === index
          ? "opacity-40 border-[#7f54b3]/40 shadow-md scale-[0.99]"
          : "border-rule hover:border-[#7f54b3]/20 hover:shadow-sm",
      ].join(" ")}
    >
      {/* Drag handle */}
      <DragHandle />

      {/* Sort position */}
      <span className="w-5 text-center text-xs font-bold text-ink-muted/50">{index + 1}</span>

      {/* Category icon */}
      <div className={[
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
        cat.enabled ? "bg-[#7f54b3]/10 text-[#7f54b3]" : "bg-canvas text-ink-muted",
      ].join(" ")}>
        {cat.name.charAt(0)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={["font-semibold truncate text-sm", cat.enabled ? "text-ink" : "text-ink-muted"].join(" ")}>
          {cat.name}
        </p>
        <p className="text-[11px] text-ink-muted">ID {cat.wc_id}</p>
      </div>

      {/* Enabled badge */}
      {cat.enabled && (
        <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-[#25D366]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#128C7E]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#25D366]" />
          Visible in bot
        </span>
      )}

      {/* Toggle */}
      <Toggle checked={cat.enabled} onChange={onToggle} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BotConfigPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dragging,   setDragging]   = useState<number | null>(null);
  const [syncing,    setSyncing]    = useState(false);
  const [synced,     setSynced]     = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);
  const [refreshMsg,   setRefreshMsg]   = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search,     setSearch]     = useState("");

  useEffect(() => {
    fetch("/api/bot/wc-categories")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setCategories(j.data.categories); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const enabledCount  = categories.filter((c) => c.enabled).length;
  const filtered      = search
    ? categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : categories;

  async function autoSave(updated: Category[]) {
    setSaving(true);
    setSynced(false);
    try {
      await fetch("/api/bot/wc-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: updated.map((c, i) => ({ wc_id: c.wc_id, enabled: c.enabled, sort_order: i + 1 })),
        }),
      });
    } catch { /* silent */ }
    setSaving(false);
  }

  function toggleCategory(wc_id: number) {
    setCategories((prev) => {
      const updated = prev.map((c) => c.wc_id === wc_id ? { ...c, enabled: !c.enabled } : c);
      autoSave(updated);
      return updated;
    });
  }

  function onDragStart(i: number) { setDragging(i); }

  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    if (dragging === null || dragging === i) return;
    setCategories((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragging, 1);
      next.splice(i, 0, item);
      setDragging(i);
      return next;
    });
  }

  function onDrop() {
    setDragging(null);
    setCategories((latest) => {
      autoSave(latest);
      return latest;
    });
  }

  async function refreshFromWoo() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res  = await fetch("/api/bot/wc-categories?refresh=true");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed");
      setCategories(json.data.categories);
      const newCount = json.data.newCount ?? 0;
      setRefreshMsg(
        newCount > 0
          ? { type: "success", text: `${newCount} new categor${newCount === 1 ? "y" : "ies"} found and added.` }
          : { type: "success", text: "All categories are up to date." }
      );
    } catch (err) {
      setRefreshMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to fetch from WooCommerce." });
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(null), 4000);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSynced(false);
    try {
      const res  = await fetch("/api/bot/wc-categories/sync", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Sync failed");
      setSynced(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="px-6 py-5 lg:px-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#7f54b3]" aria-hidden="true"><path fill="currentColor" d="M2.2 2h19.6C22.99 2 24 3.01 24 4.2v10.08c0 1.19-1.01 2.2-2.2 2.2H13.5l1.63 3.27-4.36-3.27H2.2C1.01 16.48 0 15.47 0 14.28V4.2C0 3.01 1.01 2 2.2 2zm2.01 3.33c-.31.04-.54.19-.65.5-.06.18-.04.37.02.56l2.18 6.93 2.27-4.46 2.27 4.46 2.18-6.93c.11-.37-.04-.75-.38-.92a.76.76 0 00-.99.34l-1.08 3.9-1.98-3.88-2.01 3.88-1.08-3.9c-.11-.36-.41-.52-.75-.48zm11.06.12c-.72.04-1.37.46-1.68 1.11-.31.66-.25 1.46.17 2.06.43.61 1.16.93 1.9.84.74-.09 1.38-.59 1.63-1.3.25-.7.08-1.49-.43-2.02a1.87 1.87 0 00-1.59-.69zm0 .98c.36-.01.71.17.91.47.2.3.24.69.09 1.02-.14.34-.46.57-.82.61-.36.04-.72-.12-.94-.42-.22-.3-.26-.7-.1-1.04.16-.34.5-.57.86-.64z"/></svg>
            <h1 className="text-xl font-bold text-ink">Woo Categories</h1>
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">
            Choose which categories the bot shows to customers. Drag to reorder.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              Saving…
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className={[
              "flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition",
              synced ? "bg-[#128C7E] hover:bg-[#075E54]" : "bg-[#25D366] hover:bg-[#128C7E]",
            ].join(" ")}
          >
            {syncing ? (
              <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg> Syncing…</>
            ) : synced ? (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><polyline points="20 6 9 17 4 12"/></svg> Synced to Bot</>
            ) : (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Sync to Bot</>
            )}
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="mt-5 flex gap-5 items-start max-w-4xl">

        {/* Left — search + list */}
        <div className="flex-1 min-w-0">
          {/* Search + hint */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories…"
                className="w-full rounded-xl border border-rule bg-white py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink-muted focus:border-[#7f54b3]/40 focus:outline-none focus:ring-2 focus:ring-[#7f54b3]/10"
              />
            </div>

            {/* Fetch from WooCommerce button */}
            <button
              onClick={refreshFromWoo}
              disabled={refreshing}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-rule bg-white px-3 py-2.5 text-sm font-medium text-ink-muted transition hover:border-[#7f54b3]/40 hover:text-[#7f54b3] disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={["h-4 w-4 shrink-0", refreshing ? "animate-spin" : ""].join(" ")}>
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.96"/>
              </svg>
              {refreshing ? "Checking…" : "Fetch from WooCommerce"}
            </button>

            <div className="flex items-center gap-1.5 text-xs text-ink-muted shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
              Drag to reorder
            </div>
          </div>

          {/* Refresh result message */}
          {refreshMsg && (
            <div className={[
              "mb-3 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
              refreshMsg.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-600 border border-red-200",
            ].join(" ")}>
              {refreshMsg.type === "success"
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
              {refreshMsg.text}
            </div>
          )}

          {/* List */}
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-sm text-ink-muted gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                Loading categories…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-rule bg-white py-16 text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-ink-muted/40 mb-2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <p className="text-sm font-medium text-ink-muted">No categories match</p>
              </div>
            ) : (
              filtered.map((cat, i) => (
                <CategoryRow
                  key={cat.wc_id}
                  cat={cat}
                  index={i}
                  onToggle={() => toggleCategory(cat.wc_id)}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  dragging={dragging}
                />
              ))
            )}
          </div>

          <p className="mt-4 text-center text-xs text-ink-muted">
            Toggles and reordering save automatically. Hit{" "}
            <span className="font-semibold text-[#128C7E]">Sync to Bot</span>{" "}
            to apply changes in the live bot.
          </p>
        </div>

        {/* Right — stats */}
        <div className="w-40 shrink-0 space-y-2.5">
          <div className="rounded-2xl bg-white shadow-sm px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted/60">Total</p>
            <p className="mt-1.5 text-3xl font-bold text-ink">{categories.length}</p>
            <p className="text-xs text-ink-muted/60 mt-0.5">categories</p>
          </div>
          <div className="rounded-2xl bg-[#7f54b3] px-4 py-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">Visible in Bot</p>
            <p className="mt-1.5 text-3xl font-bold text-white">{enabledCount}</p>
            <p className="text-xs text-white/60 mt-0.5">enabled</p>
          </div>
          <div className="rounded-2xl bg-white shadow-sm px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted/60">Hidden</p>
            <p className="mt-1.5 text-3xl font-bold text-ink">{categories.length - enabledCount}</p>
            <p className="text-xs text-ink-muted/60 mt-0.5">not shown</p>
          </div>
        </div>

      </div>
    </div>
  );
}
