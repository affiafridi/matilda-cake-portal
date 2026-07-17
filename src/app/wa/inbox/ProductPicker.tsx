"use client";

import { useEffect, useRef, useState } from "react";
import type { WooCategory, WooProductSummary, WooVariation } from "@/lib/woocommerce-types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  conversationId: string;
  onClose:        () => void;
  onSent:         (count: number) => void;
};

type TrayItem = {
  key:         string;
  product:     WooProductSummary;
  variation:   WooVariation | null;
  variations:  WooVariation[] | null; // null = not yet fetched
  loadingVars: boolean;
  showVars:    boolean;
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useDebounce(value: string, delay = 380) {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
}

// ── Tiny shared components ────────────────────────────────────────────────────

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-[#94a3b8] ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  );
}

function Thumb({ src, name }: { src?: string; name: string }) {
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[#f1f5f9] bg-[#f8fafc]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 text-[#cbd5e1]">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
          </svg>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProductPicker({ conversationId, onClose, onSent }: Props) {
  // Search state
  const [query,       setQuery]       = useState("");
  const [categories,  setCategories]  = useState<WooCategory[]>([]);
  const [products,    setProducts]    = useState<WooProductSummary[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [activeCat,   setActiveCat]   = useState<WooCategory | null>(null);
  const [catProducts, setCatProducts] = useState<WooProductSummary[]>([]);
  const [loadingCat,  setLoadingCat]  = useState(false);

  // Tray state
  const [tray,      setTray]      = useState<TrayItem[]>([]);
  const [sending,   setSending]   = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Mobile tab: "search" | "tray"
  const [mobileTab, setMobileTab] = useState<"search" | "tray">("search");

  const inputRef  = useRef<HTMLInputElement>(null);
  const debounced = useDebounce(query);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Search categories + products in parallel
  useEffect(() => {
    if (debounced.length < 2) {
      setCategories([]);
      setProducts([]);
      setActiveCat(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    Promise.all([
      fetch(`/api/woocommerce/categories/search?q=${encodeURIComponent(debounced)}`).then(r => r.json()),
      fetch(`/api/woocommerce/products/search?q=${encodeURIComponent(debounced)}`).then(r => r.json()),
    ])
      .then(([catRes, prodRes]: [
        { ok: boolean; data: WooCategory[] },
        { ok: boolean; data: WooProductSummary[] },
      ]) => {
        if (cancelled) return;
        setCategories(catRes.ok  ? catRes.data  : []);
        setProducts  (prodRes.ok ? prodRes.data : []);
        setActiveCat(null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  function selectCategory(cat: WooCategory) {
    setActiveCat(cat);
    setCatProducts([]);
    setLoadingCat(true);
    fetch(`/api/woocommerce/products/by-category?categoryId=${cat.id}`)
      .then(r => r.json())
      .then((j: { ok: boolean; data: WooProductSummary[] }) => { if (j.ok) setCatProducts(j.data); })
      .catch(() => {})
      .finally(() => setLoadingCat(false));
  }

  // ── Tray actions ──────────────────────────────────────────────────────────

  function addToTray(product: WooProductSummary) {
    if (tray.some(t => t.product.id === product.id)) return;
    const key = `${product.id}-${Date.now()}`;
    const isVariable = product.type === "variable";
    const item: TrayItem = {
      key,
      product,
      variation:   null,
      variations:  isVariable ? null : [],
      loadingVars: isVariable,
      showVars:    isVariable,
    };
    setTray(prev => [...prev, item]);

    if (isVariable) {
      fetch(`/api/woocommerce/products/${product.id}/variations`)
        .then(r => r.json())
        .then((j: { ok: boolean; data: WooVariation[] }) => {
          setTray(prev => prev.map(t =>
            t.key === key ? { ...t, variations: j.ok ? j.data : [], loadingVars: false } : t,
          ));
        })
        .catch(() => {
          setTray(prev => prev.map(t => t.key === key ? { ...t, variations: [], loadingVars: false } : t));
        });
    }
  }

  function removeFromTray(key: string) {
    setTray(prev => prev.filter(t => t.key !== key));
  }

  function pickVariation(key: string, v: WooVariation) {
    setTray(prev => prev.map(t =>
      t.key === key ? { ...t, variation: v, showVars: false } : t,
    ));
  }

  function toggleShowVars(key: string) {
    setTray(prev => prev.map(t => t.key === key ? { ...t, showVars: !t.showVars } : t));
  }

  const trayReady   = tray.filter(t => t.product.type !== "variable" || t.variation != null);
  const trayPending = tray.filter(t => t.product.type === "variable" && t.variation == null);

  // ── Send ──────────────────────────────────────────────────────────────────

  async function send() {
    if (!trayReady.length || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const items = trayReady.map(t => ({
        productId:       t.product.id,
        productName:     t.product.name,
        productPrice:    (() => { const p = t.variation?.price || t.product.price; return p ? `AED ${p}` : undefined; })(),
        productImageUrl: t.product.images[0]?.src,
        variationId:     t.variation?.id,
        variationName:   t.variation?.name,
      }));

      const res  = await fetch(`/api/inbox/conversations/${conversationId}/send-product`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ items }),
      });

      // API wraps response in { ok, data } envelope
      const envelope = await res.json().catch(() => null) as {
        ok: boolean;
        data?: { ok: boolean; sent: number; failed: string[] };
        error?: string;
      } | null;

      if (!envelope?.ok) {
        setSendError(envelope?.error ?? "Failed to send. Please try again.");
        return;
      }

      onSent(envelope.data?.sent ?? trayReady.length);
      onClose();
    } finally {
      setSending(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const visibleProducts = activeCat ? catProducts : products;
  const hasResults      = categories.length > 0 || products.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Modal */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl rounded-t-2xl md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:border-[#e2e8f0]"
        style={{ maxHeight: "88vh", width: "min(100vw, 800px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[#f1f5f9] px-5 py-4 shrink-0">
          <div>
            <h3 className="text-[14px] font-bold text-[#0f172a] leading-tight">Send Product Cards</h3>
            <p className="text-[11px] text-[#94a3b8] mt-0.5">Search · add to list · choose variations · send</p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#475569] transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Mobile tab bar */}
        <div className="flex border-b border-[#f1f5f9] shrink-0 md:hidden">
          {(["search", "tray"] as const).map(tab => (
            <button key={tab} type="button"
              onClick={() => setMobileTab(tab)}
              className={[
                "flex-1 py-2.5 text-[12px] font-semibold transition",
                mobileTab === tab
                  ? "border-b-2 border-brand text-brand"
                  : "text-[#64748b]",
              ].join(" ")}>
              {tab === "search" ? "Browse Products" : (
                <span className="flex items-center justify-center gap-1.5">
                  Selected
                  {tray.length > 0 && (
                    <span className="rounded-full bg-brand text-white text-[10px] px-1.5 py-0.5 leading-none">{tray.length}</span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── LEFT / SEARCH PANEL ── */}
          <div className={[
            "flex flex-col min-h-0 md:flex-1 md:border-r md:border-[#f1f5f9]",
            mobileTab === "tray" ? "hidden md:flex" : "flex w-full",
          ].join(" ")}>

            {/* Search input */}
            <div className="px-4 pt-3.5 pb-2 shrink-0">
              <div className="relative">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8] pointer-events-none">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setActiveCat(null); }}
                  placeholder="Search by product name or category…"
                  className="w-full rounded-xl border border-[#e2e8f0] bg-[#f8fafc] py-2.5 pl-9 pr-8 text-[13px] text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#94a3b8] focus:bg-white focus:outline-none transition"
                />
                {searching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Spinner className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>

              {/* Category breadcrumb */}
              {activeCat && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                  <button type="button" onClick={() => setActiveCat(null)}
                    className="text-[#64748b] hover:text-[#0f172a] transition flex items-center gap-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                      <path d="M19 12H5M12 5l-7 7 7 7"/>
                    </svg>
                    Back
                  </button>
                  <span className="text-[#e2e8f0]">/</span>
                  <span className="font-semibold text-[#0f172a]">{activeCat.name}</span>
                  <span className="text-[#94a3b8]">({activeCat.count} products)</span>
                </div>
              )}
            </div>

            {/* Results area */}
            <div className="overflow-y-auto flex-1 min-h-0 px-3 pb-3">
              {query.length < 2 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f5f9]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-[#94a3b8]">
                      <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-[#475569]">Search products</p>
                    <p className="text-[11px] text-[#94a3b8] mt-0.5">Type a product name or category — e.g. &ldquo;chocolate&rdquo;</p>
                  </div>
                </div>
              ) : activeCat ? (
                /* Products in chosen category */
                loadingCat ? (
                  <div className="flex items-center justify-center py-12"><Spinner /></div>
                ) : catProducts.length === 0 ? (
                  <EmptyResults label="No products found in this category" />
                ) : (
                  <ProductList
                    products={catProducts}
                    tray={tray}
                    onAdd={p => { addToTray(p); setMobileTab("tray"); }}
                    onRemove={removeFromTray}
                  />
                )
              ) : hasResults ? (
                <>
                  {/* Category chips */}
                  {categories.length > 0 && (
                    <div className="mb-3 mt-1">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Categories</p>
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {categories.map(cat => (
                          <button key={cat.id} type="button" onClick={() => selectCategory(cat)}
                            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#334155] shadow-sm transition hover:border-[#94a3b8] hover:shadow-none whitespace-nowrap">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-[#94a3b8]">
                              <path d="M3 6h18M3 12h18M3 18h18"/>
                            </svg>
                            {cat.name}
                            <span className="rounded-full bg-[#f1f5f9] px-1.5 py-0.5 text-[9px] font-bold text-[#64748b]">{cat.count}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Product results */}
                  {products.length > 0 && (
                    <div>
                      {categories.length > 0 && (
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Products</p>
                      )}
                      <ProductList
                        products={products}
                        tray={tray}
                        onAdd={p => { addToTray(p); setMobileTab("tray"); }}
                        onRemove={removeFromTray}
                      />
                    </div>
                  )}
                </>
              ) : !searching ? (
                <EmptyResults label={`No results for "${query}"`} />
              ) : null}
            </div>
          </div>

          {/* ── RIGHT / TRAY PANEL ── */}
          <div className={[
            "flex flex-col md:w-[272px] md:shrink-0",
            mobileTab === "search" ? "hidden md:flex" : "flex w-full",
          ].join(" ")}>

            {/* Tray header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9] shrink-0">
              <p className="text-[12px] font-bold text-[#0f172a]">
                Selected
                {tray.length > 0 && (
                  <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{tray.length}</span>
                )}
              </p>
              {tray.length > 0 && (
                <button type="button" onClick={() => setTray([])}
                  className="text-[11px] text-[#94a3b8] hover:text-red-500 transition">
                  Clear all
                </button>
              )}
            </div>

            {/* Tray items */}
            <div className="overflow-y-auto flex-1 min-h-0 p-3 space-y-2">
              {tray.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f5f9]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-[#94a3b8]">
                      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-[#475569]">Nothing selected yet</p>
                    <p className="text-[11px] text-[#94a3b8] mt-0.5">Search and add products<br/>from the left panel</p>
                  </div>
                </div>
              ) : (
                tray.map(item => (
                  <TrayCard
                    key={item.key}
                    item={item}
                    onRemove={removeFromTray}
                    onPickVariation={pickVariation}
                    onToggleVars={toggleShowVars}
                  />
                ))
              )}
            </div>

            {/* Send footer */}
            <div className="border-t border-[#f1f5f9] p-4 shrink-0 space-y-2">
              {sendError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-600 text-center">{sendError}</p>
              )}

              {trayPending.length > 0 && !sendError && (
                <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-1.5 flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-amber-500">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                  </svg>
                  <p className="text-[11px] text-amber-700">
                    {trayPending.length} item{trayPending.length > 1 ? "s" : ""} still need a variation
                  </p>
                </div>
              )}

              <button type="button" onClick={() => void send()}
                disabled={trayReady.length === 0 || sending}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#00a884] py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#009070] disabled:cursor-not-allowed disabled:opacity-40">
                {sending ? (
                  <><Spinner className="h-3.5 w-3.5" />Sending…</>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                    {trayReady.length === 0
                      ? "Send Cards"
                      : `Send ${trayReady.length} Card${trayReady.length > 1 ? "s" : ""}`}
                  </>
                )}
              </button>

              {trayReady.length > 1 && !sending && (
                <p className="text-center text-[10px] text-[#94a3b8]">Cards are sent one by one, ~0.6 s apart</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyResults({ label }: { label: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-[12px] text-[#94a3b8]">{label}</p>
    </div>
  );
}

function ProductList({
  products, tray, onAdd, onRemove,
}: {
  products: WooProductSummary[];
  tray:     TrayItem[];
  onAdd:    (p: WooProductSummary) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {products.map(p => {
        const trayItem = tray.find(t => t.product.id === p.id);
        const added    = !!trayItem;
        return (
          <div key={p.id}
            className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-[#f8fafc] transition group">
            <Thumb src={p.images[0]?.src} name={p.name} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-[#0f172a] truncate leading-tight">{p.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-[#64748b]">
                  {p.price ? `AED ${p.price}` : "Variable price"}
                </span>
                {p.type === "variable" && (
                  <span className="rounded-full bg-[#f1f5f9] px-1.5 py-0.5 text-[9px] font-semibold text-[#64748b] uppercase tracking-wide">
                    Variations
                  </span>
                )}
              </div>
            </div>
            <button type="button"
              onClick={() => added ? onRemove(trayItem?.key ?? "") : onAdd(p)}
              className={[
                "shrink-0 h-7 rounded-lg px-3 text-[11px] font-semibold transition",
                added
                  ? "bg-red-50 text-red-500 hover:bg-red-100"
                  : "bg-[#f1f5f9] text-[#334155] hover:bg-[#e2e8f0]",
              ].join(" ")}>
              {added ? "Remove" : "+ Add"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function TrayCard({
  item, onRemove, onPickVariation, onToggleVars,
}: {
  item:            TrayItem;
  onRemove:        (key: string) => void;
  onPickVariation: (key: string, v: WooVariation) => void;
  onToggleVars:    (key: string) => void;
}) {
  const isVariable     = item.product.type === "variable";
  const needsVariation = isVariable && !item.variation;
  const displayPrice   = item.variation?.price || item.product.price;

  return (
    <div className={[
      "rounded-xl border overflow-hidden",
      needsVariation ? "border-amber-200" : "border-[#e2e8f0]",
    ].join(" ")}>

      {/* Product row */}
      <div className={[
        "flex items-center gap-2.5 px-3 py-2.5",
        needsVariation ? "bg-amber-50/50" : "bg-white",
      ].join(" ")}>
        <Thumb src={item.product.images[0]?.src} name={item.product.name} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-[#0f172a] truncate leading-tight">{item.product.name}</p>
          {item.variation ? (
            <p className="text-[10px] text-emerald-600 font-medium truncate mt-0.5">
              ✓ {item.variation.name}{displayPrice ? ` · AED ${displayPrice}` : ""}
            </p>
          ) : displayPrice ? (
            <p className="text-[10px] text-[#64748b] mt-0.5">AED {displayPrice}</p>
          ) : null}
        </div>
        <button type="button" onClick={() => onRemove(item.key)}
          className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-[#94a3b8] hover:bg-red-50 hover:text-red-400 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Variation section — only for variable products */}
      {isVariable && (
        <div className="border-t border-[#f1f5f9]">
          {item.loadingVars ? (
            <div className="flex items-center gap-2 px-3 py-2">
              <Spinner className="h-3 w-3" />
              <span className="text-[10px] text-[#94a3b8]">Loading variations…</span>
            </div>
          ) : (item.variations?.length ?? 0) === 0 ? (
            <p className="px-3 py-2 text-[10px] text-[#94a3b8]">No variations available</p>
          ) : item.variation && !item.showVars ? (
            /* Collapsed: show chosen variation with a change button */
            <button type="button" onClick={() => onToggleVars(item.key)}
              className="flex w-full items-center justify-between bg-[#f8fafc] px-3 py-2 text-left transition hover:bg-[#f1f5f9]">
              <span className="text-[10px] text-[#64748b]">Variation selected</span>
              <span className="text-[10px] font-semibold text-brand">Change ↕</span>
            </button>
          ) : (
            /* Expanded: list all variations */
            <div className="px-2 py-1.5">
              <p className="px-1 mb-1 text-[10px] font-semibold text-[#64748b]">
                {item.variation ? "Change variation:" : "Choose a variation:"}
              </p>
              <div className="max-h-36 overflow-y-auto space-y-0.5">
                {item.variations!.map(v => {
                  const active = item.variation?.id === v.id;
                  return (
                    <button key={v.id} type="button" onClick={() => onPickVariation(item.key, v)}
                      className={[
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition",
                        active
                          ? "bg-emerald-50 ring-1 ring-emerald-200"
                          : "hover:bg-[#f8fafc]",
                      ].join(" ")}>
                      <span className={[
                        "text-[11px] font-semibold truncate",
                        active ? "text-emerald-700" : "text-[#334155]",
                      ].join(" ")}>
                        {v.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {v.price && (
                          <span className="text-[10px] text-[#64748b]">AED {v.price}</span>
                        )}
                        {active && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-emerald-600">
                            <path d="M20 6L9 17l-5-5"/>
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
