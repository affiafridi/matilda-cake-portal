"use client";

import { useState, useEffect } from "react";

export default function AIInstructionsPage() {
  const [prompt,   setPrompt]   = useState("");
  const [original, setOriginal] = useState("");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  const [synced,   setSynced]   = useState(false);

  const charCount = prompt.length;
  const charLimit = 4000;
  const isDirty   = prompt !== original;

  useEffect(() => {
    fetch("/api/bot/ai-config")
      .then((r) => { if (!r.ok) throw new Error("Failed to load"); return r.json(); })
      .then((json: { ok: boolean; data: { prompt?: string } }) => {
        const p = json.data?.prompt ?? "";
        setPrompt(p);
        setOriginal(p);
      })
      .catch((err) => console.error("[ai-config] load failed:", err))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/bot/ai-config", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ prompt }),
      });
      if (res.ok) {
        setOriginal(prompt);
        setSaved(true);
      }
    } catch (err) {
      console.error("[ai-config] save failed:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSynced(false);
    await fetch("/api/bot/wc-categories/sync", { method: "POST" });
    setSyncing(false);
    setSynced(true);
  }

  return (
    <div className="px-6 py-5 lg:px-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#10a37f]">
              <svg viewBox="0 0 24 24" fill="white" className="h-3.5 w-3.5">
                <path d="M22.28 9.28a5.76 5.76 0 00-.44-4.72 5.83 5.83 0 00-6.26-2.8A5.77 5.77 0 0011.34 0a5.83 5.83 0 00-5.56 4.04 5.77 5.77 0 00-3.85 2.8 5.83 5.83 0 00.72 6.84 5.77 5.77 0 00.44 4.72 5.83 5.83 0 006.26 2.8A5.77 5.77 0 0012.66 24a5.84 5.84 0 005.57-4.04 5.77 5.77 0 003.85-2.8 5.83 5.83 0 00-.8-6.88zM8.23 10.5L12 8.28l3.77 2.18v4.35L12 17l-3.77-2.18V10.5z"/>
              </svg>
            </div>
            <h1 className="text-xl font-bold text-ink">AI Instructions</h1>
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">
            Control how the AI responds — personality, rules, language, and behaviour.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saved && !saving && !isDirty && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><polyline points="20 6 9 17 4 12"/></svg>
              Saved
            </span>
          )}
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-[#1c1917] px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink/80 disabled:opacity-50"
            >
              {saving ? (
                <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg> Saving…</>
              ) : (
                <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save</>
              )}
            </button>
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

      {loading ? (
        <div className="mt-5 h-[500px] animate-pulse rounded-2xl border border-rule bg-white" />
      ) : (
        <div className="mt-5 flex gap-5 items-start">

          {/* Prompt editor (80%) */}
          <div className="flex-[4] min-w-0 rounded-2xl border border-rule bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-ink">System Prompt</p>
              <span className={["text-xs font-mono px-2 py-0.5 rounded-lg", charCount > charLimit * 0.9 ? "bg-red-50 text-red-500" : "bg-canvas text-ink-muted"].join(" ")}>
                {charCount} / {charLimit}
              </span>
            </div>
            <textarea
              rows={26}
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setSaved(false); }}
              maxLength={charLimit}
              suppressHydrationWarning
              className="w-full resize-none rounded-xl border border-rule bg-canvas px-4 py-3 text-sm font-mono text-ink placeholder:text-ink-muted focus:border-[#10a37f]/40 focus:outline-none focus:ring-2 focus:ring-[#10a37f]/10"
            />
          </div>

          {/* Right sidebar (20%) */}
          <div className="flex-[1] shrink-0 space-y-3">
            <div className="rounded-2xl border border-rule bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted/60 mb-3">Bot Preview</p>
              <div className="rounded-2xl bg-[#ECE5DD] p-3 space-y-2">
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-tr-sm bg-[#DCF8C6] px-3 py-2 text-xs text-[#111] max-w-[80%] shadow-sm">
                    I want a birthday cake
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-xs text-[#111] max-w-[85%] shadow-sm">
                    <p className="font-semibold text-[#075E54] mb-1">Your Business</p>
                    Hi! I would love to help you find the perfect birthday cake! Here are our options...
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[10px] text-ink-muted text-center">Visual preview only</p>
            </div>

            <div className="rounded-2xl bg-[#10a37f]/5 border border-[#10a37f]/20 p-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#10a37f]/70">Tips</p>
              <ul className="space-y-2 text-xs text-ink-muted">
                {[
                  "Be specific about what the bot should NOT do",
                  "Always set a fallback for unknown questions",
                  "Arabic customers respond better when replied to in Arabic",
                  "Keep rules short — the AI reads every word",
                ].map((tip, i) => (
                  <li key={i} className="flex gap-1.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#10a37f" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 mt-0.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
