"use client";

import { useState, useEffect } from "react";

type Keyword = { id: number; word: string; lang: "en" | "ar" };
type Category = { wc_id: number; name: string; keywords: Keyword[] };

function detectLang(word: string): "ar" | "en" {
  return /[؀-ۿ]/.test(word) ? "ar" : "en";
}

export default function KeywordsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expanded,   setExpanded]   = useState<number | null>(null);
  const [inputs,     setInputs]     = useState<Record<number, string>>({});
  const [loading,    setLoading]    = useState(true);
  const [syncing,    setSyncing]    = useState(false);
  const [synced,     setSynced]     = useState(false);
  const [search,     setSearch]     = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Load categories + keywords in parallel
        const [catRes, kwRes] = await Promise.all([
          fetch("/api/bot/wc-categories"),
          fetch("/api/bot/keywords"),
        ]);
        if (!catRes.ok || !kwRes.ok) throw new Error("Failed to load data");

        const catJson = await catRes.json() as { ok: boolean; data: { categories: { wc_id: number; name: string }[] } };
        const kwJson  = await kwRes.json()  as { ok: boolean; data: { id: number; wc_id: number; word: string; lang: string }[] };
        const catData = catJson.data.categories;
        const kwData  = kwJson.data;

        const grouped: Category[] = catData.map((c) => ({
          wc_id:    c.wc_id,
          name:     c.name,
          keywords: kwData
            .filter((k) => k.wc_id === c.wc_id)
            .map((k) => ({ id: k.id, word: k.word, lang: k.lang as "en" | "ar" })),
        }));

        setCategories(grouped);
        if (grouped.length > 0) setExpanded(grouped[0].wc_id);
      } catch (err) {
        console.error("[keywords] load failed:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function addKeyword(wc_id: number) {
    const word = (inputs[wc_id] ?? "").trim();
    if (!word) return;
    const lang = detectLang(word);

    const res  = await fetch("/api/bot/keywords", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ wc_id, word, lang }),
    });
    if (!res.ok) return;

    const { data: kw } = await res.json() as { data: { id: number; wc_id: number; word: string; lang: string } };
    setCategories((prev) => prev.map((c) =>
      c.wc_id === wc_id
        ? { ...c, keywords: [...c.keywords, { id: kw.id, word: kw.word, lang: kw.lang as "en" | "ar" }] }
        : c
    ));
    setInputs((prev) => ({ ...prev, [wc_id]: "" }));
    setSynced(false);
  }

  async function removeKeyword(wc_id: number, id: number) {
    const res = await fetch(`/api/bot/keywords/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setCategories((prev) => prev.map((c) =>
      c.wc_id === wc_id
        ? { ...c, keywords: c.keywords.filter((k) => k.id !== id) }
        : c
    ));
    setSynced(false);
  }

  async function handleSync() {
    setSyncing(true);
    await fetch("/api/bot/wc-categories/sync", { method: "POST" });
    setSyncing(false);
    setSynced(true);
  }

  const filtered = search
    ? categories.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.keywords.some((k) => k.word.toLowerCase().includes(search.toLowerCase()))
      )
    : categories;

  const totalKeywords = categories.reduce((s, c) => s + c.keywords.length, 0);
  const arCount       = categories.reduce((s, c) => s + c.keywords.filter((k) => k.lang === "ar").length, 0);
  const enCount       = totalKeywords - arCount;

  return (
    <div className="px-6 py-5 lg:px-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#10a37f]">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </div>
            <h1 className="text-xl font-bold text-ink">Keyword Manager</h1>
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">
            Words that trigger each category in the WhatsApp bot. Supports English and Arabic.
          </p>
        </div>

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

      {/* Stats */}
      <div className="mt-4 flex items-center gap-6 border-b border-rule pb-4">
        {loading ? (
          <div className="h-5 w-40 animate-pulse rounded bg-rule" />
        ) : (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-ink">{totalKeywords}</span>
              <span className="text-sm text-ink-muted">total keywords</span>
            </div>
            <div className="h-4 w-px bg-rule" />
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              <span className="text-sm font-medium text-ink">{enCount}</span>
              <span className="text-sm text-ink-muted">English</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-sm font-medium text-ink">{arCount}</span>
              <span className="text-sm text-ink-muted">Arabic</span>
            </div>
          </>
        )}
      </div>

      {/* Search */}
      <div className="relative mt-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted pointer-events-none">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories or keywords…"
          suppressHydrationWarning
          className="w-full rounded-xl border border-rule bg-white py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink-muted focus:border-[#10a37f]/40 focus:outline-none focus:ring-2 focus:ring-[#10a37f]/10"
        />
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="mt-3 space-y-1">
          {[1,2,3,4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-white border border-rule" />
          ))}
        </div>
      )}

      {/* Category list */}
      {!loading && (
        <div className="mt-3 space-y-1">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-muted">No categories found.</p>
          )}
          {filtered.map((cat) => {
            const isOpen  = expanded === cat.wc_id;
            const enWords = cat.keywords.filter((k) => k.lang === "en");
            const arWords = cat.keywords.filter((k) => k.lang === "ar");

            return (
              <div key={cat.wc_id}
                className={[
                  "rounded-2xl border bg-white transition-all",
                  isOpen ? "border-rule shadow-sm" : "border-transparent hover:border-rule",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : cat.wc_id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-canvas text-xs font-semibold text-ink-muted">
                    {cat.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink">{cat.name}</p>
                    <p className="text-[11px] text-ink-muted">{cat.keywords.length} keywords</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {enWords.length > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-ink-muted">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        EN {enWords.length}
                      </span>
                    )}
                    {arWords.length > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-ink-muted">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        AR {arWords.length}
                      </span>
                    )}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                      className={["h-4 w-4 text-ink-muted/40 transition-transform", isOpen ? "rotate-180" : ""].join(" ")}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-rule px-4 pb-4 pt-3">
                    <div className="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
                      {cat.keywords.length === 0 && (
                        <p className="text-xs text-ink-muted italic">No keywords yet — add one below</p>
                      )}
                      {cat.keywords.map((kw) => (
                        <span key={kw.id}
                          className="group inline-flex items-center gap-1.5 rounded-lg border border-rule bg-canvas px-2.5 py-1 text-xs text-ink"
                          dir={kw.lang === "ar" ? "rtl" : "ltr"}
                        >
                          <span className={["h-1.5 w-1.5 rounded-full shrink-0", kw.lang === "ar" ? "bg-amber-400" : "bg-slate-400"].join(" ")} />
                          {kw.word}
                          <button
                            onClick={() => removeKeyword(cat.wc_id, kw.id)}
                            className="ml-0.5 text-ink-muted opacity-0 group-hover:opacity-100 transition hover:text-red-500"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inputs[cat.wc_id] ?? ""}
                        onChange={(e) => setInputs((prev) => ({ ...prev, [cat.wc_id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") addKeyword(cat.wc_id); }}
                        placeholder="Type keyword and press Enter… (Arabic or English)"
                        dir="auto"
                        className="flex-1 rounded-xl border border-rule bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-[#10a37f]/40 focus:outline-none focus:ring-2 focus:ring-[#10a37f]/10"
                      />
                      <button
                        onClick={() => addKeyword(cat.wc_id)}
                        disabled={!(inputs[cat.wc_id] ?? "").trim()}
                        className="flex items-center gap-1.5 rounded-xl bg-[#1c1917] px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink/80 disabled:opacity-30"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
