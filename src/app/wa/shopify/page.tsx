"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const BRAND = "#95BF47";
const BRAND_DARK = "#6a8f2f";

type Collection = { source_id: number; name: string; enabled: boolean; sort_order: number };
type Product    = { id: number; source_id: number; name: string; price: string; image: string; permalink: string; enabled: boolean; sort_order: number };

// ── Icons ──────────────────────────────────────────────────────────────────────

function DragHandle() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-ink-muted/40 group-hover:text-ink-muted transition-colors cursor-grab active:cursor-grabbing">
      <circle cx="7" cy="5" r="1.5"/><circle cx="13" cy="5" r="1.5"/>
      <circle cx="7" cy="10" r="1.5"/><circle cx="13" cy="10" r="1.5"/>
      <circle cx="7" cy="15" r="1.5"/><circle cx="13" cy="15" r="1.5"/>
    </svg>
  );
}

function Spinner({ cls = "h-4 w-4" }: { cls?: string }) {
  return (
    <svg className={`animate-spin ${cls}`} style={{ color: BRAND }} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange}
      style={checked ? { backgroundColor: BRAND } : undefined}
      className={["relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
        checked ? "" : "bg-rule"].join(" ")}>
      <span className={["pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200",
        checked ? "translate-x-4" : "translate-x-0"].join(" ")} />
    </button>
  );
}

// ── Simulated progress bar ─────────────────────────────────────────────────────

function useSimulatedProgress(active: boolean) {
  const [pct, setPct] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (active) {
      setPct(0);
      timerRef.current = setInterval(() => setPct((p) => p >= 85 ? p : p + (85 - p) * 0.06), 120);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setPct((p) => p > 0 ? 100 : 0);
      const t = setTimeout(() => setPct(0), 600);
      return () => clearTimeout(t);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active]);
  return Math.round(pct);
}

function ProgressBar({ active }: { active: boolean }) {
  const pct = useSimulatedProgress(active);
  const visible = pct > 0;
  return (
    <div className={["absolute bottom-0 left-0 right-0 transition-opacity duration-300", visible ? "opacity-100" : "opacity-0"].join(" ")}>
      <div className="relative h-[3px]" style={{ backgroundColor: `${BRAND}1a` }}>
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-200 ease-out" style={{ width: `${pct}%`, backgroundColor: BRAND }} />
        {visible && (
          <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center pointer-events-none" style={{ top: "-14px" }}>
            <span className="text-[10px] font-semibold tabular-nums leading-none" style={{ color: BRAND }}>{pct}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Collection row ─────────────────────────────────────────────────────────────

function CollectionRow({ col, index, selected, onSelect, onToggle, onDragStart, onDragOver, onDrop, dragging }: {
  col: Collection; index: number; selected: boolean;
  onSelect: () => void; onToggle: () => void;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: (i: number) => void;
  dragging: number | null;
}) {
  return (
    <div draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, index); }}
      onDrop={() => onDrop(index)}
      onClick={onSelect}
      className={["group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition select-none cursor-pointer",
        dragging === index ? "opacity-40 scale-[0.99]"
          : selected ? "bg-white"
          : "border-rule bg-white hover:border-gray-300"].join(" ")}
      style={dragging === index ? { borderColor: `${BRAND}66` }
        : selected ? { borderColor: `${BRAND}80`, backgroundColor: `${BRAND}08` }
        : undefined}>
      <DragHandle />
      <span className="w-4 text-center text-[10px] font-bold text-ink-muted/50">{index + 1}</span>
      <div
        className={["flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
          col.enabled ? "" : "bg-canvas text-ink-muted"].join(" ")}
        style={col.enabled ? { backgroundColor: `${BRAND}1a`, color: BRAND_DARK } : undefined}>
        {col.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className={["font-semibold truncate text-xs", col.enabled ? "text-ink" : "text-ink-muted"].join(" ")}>{col.name}</p>
      </div>
      <Toggle checked={col.enabled} onChange={onToggle} />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ShopifyPage() {
  const [collections,   setCollections]   = useState<Collection[]>([]);
  const [loadingCols,   setLoadingCols]   = useState(true);
  const [dragging,      setDragging]      = useState<number | null>(null);
  const [colSaving,     setColSaving]     = useState(false);
  const [syncing,       setSyncing]       = useState(false);
  const [synced,        setSynced]        = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [refreshMsg,    setRefreshMsg]    = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [colSearch,     setColSearch]     = useState("");
  const [selectedCol,   setSelectedCol]   = useState<Collection | null>(null);

  const [products,      setProducts]      = useState<Product[]>([]);
  const [loadingColId,  setLoadingColId]  = useState<number | null>(null);
  const [syncingColId,  setSyncingColId]  = useState<number | null>(null);
  const [prodSaving,    setProdSaving]    = useState(false);
  const [prodDirty,     setProdDirty]     = useState(false);
  const [prodSearch,    setProdSearch]    = useState("");
  const [toast,         setToast]         = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  const isLoadingProds = selectedCol ? loadingColId === selectedCol.source_id : false;
  const isSyncingProds = selectedCol ? syncingColId === selectedCol.source_id : false;
  const isBusy         = isLoadingProds || isSyncingProds;

  // Load collections on mount
  useEffect(() => {
    fetch("/api/bot/shopify-collections")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setCollections(j.data.collections); })
      .finally(() => setLoadingCols(false));
  }, []);

  // Load products for selected collection
  const loadProducts = useCallback(async (col: Collection, refresh = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const colId = col.source_id;
    if (refresh) {
      setSyncingColId(colId);
    } else {
      setLoadingColId(colId);
      setProducts([]);
      setProdDirty(false);
      setProdSearch("");
    }
    try {
      const res = await fetch(
        `/api/bot/shopify-products-admin?collectionId=${colId}${refresh ? "&refresh=true" : ""}`,
        { signal: controller.signal },
      );
      const j = await res.json();
      if (!controller.signal.aborted && j.ok) {
        setProducts(j.data.products);
        if (refresh) setProdDirty(false);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    } finally {
      if (!controller.signal.aborted) {
        setLoadingColId((prev) => prev === colId ? null : prev);
        setSyncingColId((prev) => prev === colId ? null : prev);
      }
    }
  }, []);

  function selectCol(col: Collection) {
    if (selectedCol?.source_id === col.source_id) return;
    setSelectedCol(col);
    loadProducts(col);
  }

  // ── Collection actions ────────────────────────────────────────────────────

  async function autoSave(updated: Collection[]) {
    setColSaving(true);
    try {
      await fetch("/api/bot/shopify-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collections: updated.map((c, i) => ({ source_id: c.source_id, enabled: c.enabled, sort_order: i + 1 })) }),
      });
    } finally { setColSaving(false); }
  }

  function toggleCollection(source_id: number) {
    setCollections((prev) => {
      const updated = prev.map((c) => c.source_id === source_id ? { ...c, enabled: !c.enabled } : c);
      autoSave(updated);
      return updated;
    });
  }

  function onDragStart(i: number) { setDragging(i); }
  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    if (dragging === null || dragging === i) return;
    setCollections((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragging, 1);
      next.splice(i, 0, item);
      setDragging(i);
      return next;
    });
  }
  function onDrop() {
    setDragging(null);
    setCollections((latest) => { autoSave(latest); return latest; });
  }

  async function refreshFromShopify() {
    setRefreshing(true); setRefreshMsg(null);
    try {
      const res  = await fetch("/api/bot/shopify-collections?refresh=true");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed");
      setCollections(json.data.collections);
      const n = json.data.newCount ?? 0;
      setRefreshMsg({ type: "success", text: n > 0 ? `${n} new collection${n === 1 ? "" : "s"} added.` : "All collections are up to date." });
    } catch (err) {
      setRefreshMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to fetch." });
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(null), 4000);
    }
  }

  async function handleSync() {
    setSyncing(true); setSynced(false);
    try {
      const res  = await fetch("/api/bot/wc-categories/sync", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Sync failed");
      setSynced(true);
      setTimeout(() => setSynced(false), 3000);
    } catch (err) { alert(err instanceof Error ? err.message : "Sync failed"); }
    finally { setSyncing(false); }
  }

  // ── Product actions ───────────────────────────────────────────────────────

  function toggleProduct(id: number) {
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, enabled: !p.enabled } : p));
    setProdDirty(true);
  }

  function toggleAllProducts(enabled: boolean) {
    setProducts((prev) => prev.map((p) => ({ ...p, enabled })));
    setProdDirty(true);
  }

  async function syncProducts() {
    if (!selectedCol || isBusy) return;
    await loadProducts(selectedCol, true);
    showToast("Products synced from Shopify");
  }

  async function saveProducts() {
    if (!prodDirty) return;
    setProdSaving(true);
    try {
      const res = await fetch("/api/bot/shopify-products-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: products.map((p, i) => ({ id: p.id, enabled: p.enabled, sort_order: i })) }),
      });
      const j = await res.json();
      if (j.ok) { setProdDirty(false); showToast("Products saved"); }
      else showToast("Save failed");
    } finally { setProdSaving(false); }
  }

  const enabledColCount  = collections.filter((c) => c.enabled).length;
  const filteredCols     = colSearch ? collections.filter((c) => c.name.toLowerCase().includes(colSearch.toLowerCase())) : collections;
  const filteredProds    = prodSearch ? products.filter((p) => p.name.toLowerCase().includes(prodSearch.toLowerCase())) : products;
  const enabledProdCount = products.filter((p) => p.enabled).length;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      {/* ── Top toolbar ── */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-rule bg-canvas flex-wrap">
        <div className="flex items-center gap-2 mr-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-rule bg-white px-3 py-1.5">
            <span className="text-sm font-bold text-ink">{collections.length}</span>
            <span className="text-[11px] text-ink-muted">Total</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5" style={{ backgroundColor: BRAND }}>
            <span className="text-sm font-bold text-white">{enabledColCount}</span>
            <span className="text-[11px] text-white/70">Enabled</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-rule bg-white px-3 py-1.5">
            <span className="text-sm font-bold text-ink">{collections.length - enabledColCount}</span>
            <span className="text-[11px] text-ink-muted">Hidden</span>
          </div>
        </div>

        {colSaving && <span className="text-[11px] text-ink-muted">Auto-saving…</span>}
        {refreshMsg && (
          <span className={["rounded-lg px-2.5 py-1 text-[11px] font-medium",
            refreshMsg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"].join(" ")}>
            {refreshMsg.text}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={refreshFromShopify} disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl border border-rule bg-white px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-gray-400 transition disabled:opacity-50"
            style={{ ["--tw-ring-color" as string]: BRAND }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={["h-3.5 w-3.5 shrink-0", refreshing ? "animate-spin" : ""].join(" ")}>
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.96"/>
            </svg>
            {refreshing ? "Fetching…" : "Fetch from Shopify"}
          </button>

          <div className="relative group">
            <button onClick={handleSync} disabled={syncing}
              className={["flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold text-white transition",
                synced ? "bg-[#128C7E]" : "bg-[#25D366] hover:bg-[#128C7E]", syncing ? "opacity-70 cursor-not-allowed" : ""].join(" ")}>
              {syncing
                ? <><Spinner cls="h-3.5 w-3.5 text-white"/>Reloading bot…</>
                : synced
                ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5"><polyline points="20 6 9 17 4 12"/></svg>Bot reloaded!</>
                : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>Reload Bot Config</>}
            </button>
            <div className="absolute top-full right-0 mt-2 hidden group-hover:block z-50 w-56 rounded-xl bg-ink px-3 py-2 text-[11px] text-white shadow-lg pointer-events-none">
              Tells the bot to reload all settings from the database — collections, products, and flow config. Run this after making any changes here.
              <div className="absolute bottom-full right-4 border-4 border-transparent border-b-ink" />
            </div>
          </div>

          <button type="button" onClick={saveProducts} disabled={!prodDirty || prodSaving}
            className="flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition disabled:opacity-40"
            style={{ backgroundColor: BRAND }}>
            {prodSaving ? <Spinner cls="h-3.5 w-3.5"/> : null}
            {prodSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Split layout ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT — collections */}
        <aside className="w-72 shrink-0 border-r border-rule flex flex-col bg-canvas">
          <div className="px-3 py-2 border-b border-rule">
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input value={colSearch} onChange={(e) => setColSearch(e.target.value)}
                placeholder="Search collections…"
                className="w-full rounded-lg border border-rule bg-white py-1.5 pl-8 pr-3 text-xs text-ink placeholder:text-ink-muted/50 focus:outline-none focus:ring-2"
                style={{ ["--tw-ring-color" as string]: `${BRAND}33` }} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {loadingCols ? (
              <div className="flex items-center justify-center py-12"><Spinner /></div>
            ) : filteredCols.length === 0 ? (
              <p className="text-center text-xs text-ink-muted py-8">
                {collections.length === 0
                  ? 'No collections yet — click "Fetch from Shopify" to import'
                  : "No collections match your search"}
              </p>
            ) : filteredCols.map((col, i) => (
              <CollectionRow key={col.source_id} col={col} index={i}
                selected={selectedCol?.source_id === col.source_id}
                onSelect={() => selectCol(col)}
                onToggle={() => toggleCollection(col.source_id)}
                onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
                dragging={dragging} />
            ))}
          </div>
          <p className="px-3 py-2 text-center text-[10px] text-ink-muted border-t border-rule">
            Click a collection to manage its products · Drag to reorder
          </p>
        </aside>

        {/* RIGHT — products */}
        <main className="flex-1 min-w-0 flex flex-col bg-surface">
          {!selectedCol ? (
            <div className="flex flex-1 items-center justify-center flex-col gap-3 text-ink-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-12 w-12 opacity-20">
                <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              <p className="text-sm font-medium">Select a collection to manage its products</p>
            </div>
          ) : (
            <>
              {/* Products header */}
              <div className="relative flex items-center justify-between gap-3 px-5 py-3 border-b border-rule bg-canvas flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input value={prodSearch} onChange={(e) => setProdSearch(e.target.value)}
                      placeholder={`Search ${selectedCol.name}…`}
                      className="rounded-lg border border-rule bg-white py-1.5 pl-8 pr-3 text-xs text-ink placeholder:text-ink-muted/50 focus:outline-none focus:ring-2 w-48"
                      style={{ ["--tw-ring-color" as string]: `${BRAND}33` }} />
                  </div>
                  <p className="text-[11px] text-ink-muted whitespace-nowrap">
                    {`${enabledProdCount} of ${products.length} enabled`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(products.length > 0 || isSyncingProds) && (
                    <>
                      <button type="button" onClick={syncProducts} disabled={isBusy}
                        className="flex items-center gap-1 rounded-lg border border-rule bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink-muted hover:border-gray-400 transition disabled:opacity-50">
                        {isSyncingProds
                          ? <Spinner cls="h-3 w-3"/>
                          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.96"/></svg>}
                        {isSyncingProds ? "Syncing…" : "Sync products"}
                      </button>
                      {!isBusy && (
                        <>
                          <button type="button" onClick={() => toggleAllProducts(true)}
                            className="rounded-lg border border-rule bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink hover:bg-gray-50 transition">
                            Enable all
                          </button>
                          <button type="button" onClick={() => toggleAllProducts(false)}
                            className="rounded-lg border border-rule bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink hover:bg-gray-50 transition">
                            Disable all
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
                <ProgressBar active={isBusy} />
              </div>

              {/* Products grid */}
              <div className="flex-1 overflow-y-auto p-5">
                {isLoadingProds ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="rounded-xl border border-rule bg-white overflow-hidden animate-pulse">
                        <div className="w-full h-28 bg-gray-100" />
                        <div className="p-2.5 space-y-1.5">
                          <div className="h-3 bg-gray-100 rounded w-3/4" />
                          <div className="h-2.5 bg-gray-100 rounded w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredProds.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-ink-muted">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-10 w-10 opacity-20">
                      <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
                    </svg>
                    <p className="text-sm font-medium">
                      {products.length === 0 ? "No products yet — click Sync products to import" : "No products match your search"}
                    </p>
                    {products.length === 0 && (
                      <button type="button" onClick={syncProducts} disabled={isBusy}
                        className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition disabled:opacity-50"
                        style={{ backgroundColor: BRAND }}>
                        {isSyncingProds ? <Spinner cls="h-3 w-3"/> : null} Sync now
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {filteredProds.map((product) => (
                      <div key={product.id}
                        className={["rounded-xl border bg-white overflow-hidden transition",
                          product.enabled ? "border-rule" : "border-rule opacity-50"].join(" ")}>
                        {product.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.image} alt={product.name} className="w-full h-28 object-cover bg-gray-50"/>
                        ) : (
                          <div className="w-full h-28 bg-gray-100 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7 text-gray-300">
                              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                            </svg>
                          </div>
                        )}
                        <div className="p-2.5">
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold text-ink leading-snug line-clamp-2">{product.name}</p>
                              {product.price && (
                                <p className="text-[11px] font-medium mt-0.5" style={{ color: BRAND_DARK }}>
                                  {product.price}
                                </p>
                              )}
                            </div>
                            <Toggle checked={product.enabled} onChange={() => toggleProduct(product.id)} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
