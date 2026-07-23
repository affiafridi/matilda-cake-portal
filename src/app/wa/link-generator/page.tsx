"use client";

import { useEffect, useRef, useState } from "react";

type SearchResult = {
  id:    number;
  name:  string;
  slug:  string;
  type:  "product" | "category";
  price?: string;
  image?: string;
};

export default function LinkGeneratorPage() {
  const [campaignName,   setCampaignName]   = useState("");
  const [query,          setQuery]          = useState("");
  const [results,        setResults]        = useState<SearchResult[]>([]);
  const [searching,      setSearching]      = useState(false);
  const [selected,       setSelected]       = useState<SearchResult | null>(null);
  const [wcBase,         setWcBase]         = useState("");
  const [wcUnconfigured, setWcUnconfigured] = useState(false);
  const [copied,         setCopied]         = useState(false);
  const [hoveredId,      setHoveredId]      = useState<string | null>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/woocommerce/config")
      .then(r => r.json())
      .then(j => {
        if (j.ok && j.data?.wc_url) setWcBase(j.data.wc_url);
        else setWcUnconfigured(true);
      })
      .catch(() => setWcUnconfigured(true));
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setResults([]);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function search(q: string) {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`/api/woocommerce/products/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
        fetch(`/api/woocommerce/categories/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
      ]);
      const products: SearchResult[] = (pRes.data ?? []).map((p: { id: number; name: string; price?: string; images?: { src: string }[] }) => ({
        id: p.id, name: p.name, slug: "", type: "product" as const, price: p.price,
        image: p.images?.[0]?.src,
      }));
      const categories: SearchResult[] = (cRes.data ?? []).map((c: { id: number; name: string; slug: string }) => ({
        id: c.id, name: c.name, slug: c.slug, type: "category" as const,
      }));
      setResults([...categories, ...products]);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleQuery(v: string) {
    setQuery(v);
    setSelected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 350);
  }

  function select(r: SearchResult) {
    setSelected(r);
    setQuery(r.name);
    setResults([]);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
  }

  const slug = campaignName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const generatedUrl = selected && wcBase && slug
    ? selected.type === "product"
      ? `${wcBase}/checkout/?add-to-cart=${selected.id}&utm_source=whatsapp&utm_medium=campaign&utm_campaign=${slug}&wa_id=`
      : `${wcBase}/product-category/${selected.slug}/?utm_source=whatsapp&utm_medium=campaign&utm_campaign=${slug}&wa_id=`
    : "";

  function copyUrl() {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  const step1Done = !!slug;
  const step2Done = !!selected;

  return (
    <div className="min-h-screen bg-[#f8fafc] px-4 py-5 sm:px-8">
      <div className="mx-auto max-w-2xl">

        {/* Header */}
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0f172a]">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 h-[18px] w-[18px]">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <h1 className="text-[18px] font-bold text-[#0f172a]">Link Generator</h1>
          </div>
          <p className="text-[13px] text-[#64748b] leading-relaxed">
            Create a WhatsApp tracking link for any product or category. Paste it in your Meta template as a <strong className="text-[#374151]">Dynamic URL</strong> — the bot fills in each recipient&apos;s ID automatically.
          </p>
        </div>

        {/* Warning: WC not configured */}
        {wcUnconfigured && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-[12.5px] text-amber-700">
              WooCommerce is not configured. Go to <strong>Settings → Integrations</strong> to add your store URL.
            </p>
          </div>
        )}

        {/* Form card */}
        <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm overflow-hidden">

          {/* Step 1 — Campaign Name */}
          <div className={["border-b border-[#f0f2f5] px-6 py-4 transition-all", step1Done ? "bg-white" : "bg-white"].join(" ")}>
            <div className="mb-2.5 flex items-center gap-2.5">
              <StepBadge n={1} done={step1Done} />
              <div>
                <p className="text-[13px] font-semibold text-[#0f172a]">Campaign Name</p>
                <p className="text-[11.5px] text-[#64748b]">Used as the UTM campaign slug in the URL</p>
              </div>
            </div>
            <input
              type="text"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="e.g. Eid Sale 2025, Summer Promo…"
              className="w-full rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3 text-[13.5px] text-[#0f172a] placeholder:text-[#9ca3af] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f172a]/15 transition"
            />
            {slug && (
              <p className="mt-2 text-[11px] text-[#94a3b8]">
                Slug: <span className="font-mono text-[#64748b]">{slug}</span>
              </p>
            )}
          </div>

          {/* Step 2 — Product / Category */}
          <div className="border-b border-[#f0f2f5] px-6 py-4">
            <div className="mb-2.5 flex items-center gap-2.5">
              <StepBadge n={2} done={step2Done} />
              <div>
                <p className="text-[13px] font-semibold text-[#0f172a]">Product or Category</p>
                <p className="text-[11.5px] text-[#64748b]">Search your WooCommerce store</p>
              </div>
            </div>

            {selected ? (
              /* Selected state */
              <div className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3">
                {selected.image ? (
                  <img src={selected.image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover border border-[#e5e7eb]" />
                ) : (
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border ${selected.type === "category" ? "border-violet-200 bg-violet-50" : "border-[#e5e7eb] bg-[#f1f5f9]"}`}>
                    {selected.type === "category" ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-violet-400">
                        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-[#94a3b8]">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                      </svg>
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={["rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      selected.type === "category" ? "bg-violet-50 text-violet-700 border border-violet-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200",
                    ].join(" ")}>{selected.type === "category" ? "Category" : "Product"}</span>
                  </div>
                  <p className="truncate text-[13.5px] font-semibold text-[#0f172a]">{selected.name}</p>
                  {selected.price && <p className="text-[12px] text-[#64748b]">{selected.price}</p>}
                </div>
                <button onClick={clearSelection}
                  className="shrink-0 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#64748b] hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition">
                  Change
                </button>
              </div>
            ) : (
              /* Search state */
              <div className="relative" ref={dropdownRef}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={e => handleQuery(e.target.value)}
                  placeholder="Search products or categories…"
                  className="w-full rounded-xl border border-[#e5e7eb] bg-[#f8fafc] pl-11 pr-4 py-3 text-[13.5px] text-[#0f172a] placeholder:text-[#9ca3af] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f172a]/15 transition"
                />
                {searching && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <svg className="h-4 w-4 animate-spin text-[#94a3b8]" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25"/>
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75"/>
                    </svg>
                  </div>
                )}

                {results.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-[#e5e7eb] bg-white shadow-xl">
                    {results.map(r => {
                      const key = `${r.type}-${r.id}`;
                      const isHovered = hoveredId === key;
                      return (
                        <button key={key} onClick={() => select(r)}
                          onMouseEnter={() => setHoveredId(key)}
                          onMouseLeave={() => setHoveredId(null)}
                          className="flex w-full flex-col text-left transition-colors hover:bg-[#f8fafc]">
                          <div className="flex w-full items-center gap-3 px-4 py-3">
                            {r.type === "product" && r.image ? (
                              <img src={r.image} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover border border-[#e5e7eb]" />
                            ) : (
                              <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center border ${r.type === "category" ? "bg-violet-50 border-violet-200" : "bg-[#f1f5f9] border-[#e5e7eb]"}`}>
                                {r.type === "category" ? (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-violet-400">
                                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-[#94a3b8]">
                                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                                  </svg>
                                )}
                              </div>
                            )}
                            <span className={["shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                              r.type === "category" ? "bg-violet-50 text-violet-700 border border-violet-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200",
                            ].join(" ")}>{r.type === "category" ? "Cat" : "Prod"}</span>
                            <span className="flex-1 truncate text-[13px] font-medium text-[#0f172a]">{r.name}</span>
                            {r.price && <span className="shrink-0 text-[12px] font-semibold text-[#64748b]">{r.price}</span>}
                          </div>
                          {r.type === "product" && isHovered && r.image && (
                            <div className="mx-4 mb-3 flex items-start gap-3 rounded-xl border border-[#e5e7eb] bg-white p-3 shadow-sm">
                              <img src={r.image} alt={r.name} className="h-20 w-20 shrink-0 rounded-xl object-cover border border-[#e5e7eb]" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold leading-snug text-[#0f172a]">{r.name}</p>
                                {r.price && <p className="mt-1 text-[15px] font-bold text-emerald-600">{r.price}</p>}
                                <p className="mt-1.5 text-[11px] text-[#94a3b8]">Click to select</p>
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 3 — Generated URL */}
          <div className="px-6 py-4">
            <div className="mb-2.5 flex items-center gap-2.5">
              <StepBadge n={3} done={!!generatedUrl} />
              <div>
                <p className="text-[13px] font-semibold text-[#0f172a]">Your Tracking Link</p>
                <p className="text-[11.5px] text-[#64748b]">Paste this as a Dynamic URL in your Meta template</p>
              </div>
            </div>

            {generatedUrl ? (
              <div className="space-y-3">
                {/* URL output */}
                <div className="group relative rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
                  <p className="break-all font-mono text-[12px] leading-relaxed text-[#374151] pr-2">{generatedUrl}</p>
                </div>

                {/* Copy button */}
                <button onClick={copyUrl}
                  className={["w-full rounded-xl py-3 text-[13.5px] font-semibold transition-all duration-200",
                    copied
                      ? "bg-emerald-500 text-white"
                      : "bg-[#0f172a] text-white hover:bg-[#1e293b] active:scale-[0.99]",
                  ].join(" ")}>
                  {copied ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Copied to clipboard!
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      Copy Link
                    </span>
                  )}
                </button>

                {/* Usage instructions */}
                <div className="rounded-xl border border-[#f0f2f5] bg-[#f8fafc] px-4 py-3.5 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#94a3b8]">How to use this link</p>
                  <div className="space-y-1.5 text-[12px] text-[#64748b]">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[9px] font-bold text-white">1</span>
                      <span>In Meta Business Suite, go to <strong className="text-[#374151]">WhatsApp Manager → Templates → Edit</strong></span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[9px] font-bold text-white">2</span>
                      <span>Add a button, choose <strong className="text-[#374151]">Visit Website → Dynamic URL</strong>, paste this link</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[9px] font-bold text-white">3</span>
                      <span>Set example suffix to any phone number e.g. <span className="font-mono bg-[#e8ecf0] rounded px-1">971501234567</span></span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[9px] font-bold text-white">4</span>
                      <span>The bot fills <span className="font-mono bg-[#e8ecf0] rounded px-1">wa_id=</span> per recipient automatically at send time</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Empty state */
              <div className="rounded-xl border border-dashed border-[#d1d5db] bg-[#f8fafc] px-6 py-10 text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round"
                  className="mx-auto mb-3 h-9 w-9 text-[#d1d5db]">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                </svg>
                <p className="text-[13px] font-semibold text-[#94a3b8]">Complete steps 1 &amp; 2 above</p>
                <p className="mt-1 text-[12px] text-[#c0c7d0]">Your tracking link will appear here</p>
              </div>
            )}
          </div>
        </div>

        {/* Reset */}
        {(campaignName || selected) && (
          <button
            onClick={() => { setCampaignName(""); setSelected(null); setQuery(""); setResults([]); }}
            className="mt-4 w-full rounded-xl border border-[#e5e7eb] bg-white py-2.5 text-[13px] font-semibold text-[#64748b] hover:border-red-200 hover:text-red-500 transition">
            Start over
          </button>
        )}
      </div>
    </div>
  );
}

function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <div className={["flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition-all",
      done
        ? "bg-emerald-500 text-white"
        : "bg-[#f1f5f9] text-[#94a3b8]",
    ].join(" ")}>
      {done ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : n}
    </div>
  );
}
