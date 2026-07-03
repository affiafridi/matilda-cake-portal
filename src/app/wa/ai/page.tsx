"use client";

import { useState, useEffect, useRef } from "react";

const SECTIONS = [
  {
    key: "identity",
    label: "Identity",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
    placeholder: "Who is the bot? e.g. You are Matilda, a cake assistant for Matilda Cakes in Dubai...",
  },
  {
    key: "rules",
    label: "Rules",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
    placeholder: "What should the bot always or never do?",
  },
  {
    key: "tone",
    label: "Tone",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
    placeholder: "How should the bot sound? e.g. Friendly, professional, warm...",
  },
  {
    key: "ordering",
    label: "Ordering",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
      </svg>
    ),
    placeholder: "How should the bot handle order requests? What info to collect?",
  },
  {
    key: "language",
    label: "Language",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
      </svg>
    ),
    placeholder: "e.g. Always reply in the same language the customer uses.",
  },
  {
    key: "fallback",
    label: "Fallback",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
      </svg>
    ),
    placeholder: "What to do when the bot does not know the answer?",
  },
];

type Mode = "simple" | "advanced";

function parsePromptToSections(prompt: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const sec of SECTIONS) {
    const regex = new RegExp(`\\[${sec.label}\\]\\s*([\\s\\S]*?)(?=\\n\\[|$)`, "i");
    const match = prompt.match(regex);
    result[sec.key] = match ? match[1].trim() : "";
  }
  return result;
}

export default function AIInstructionsPage() {
  const [mode,     setMode]     = useState<Mode>("simple");
  const [prompt,   setPrompt]   = useState("");
  const [sections, setSections] = useState<Record<string, string>>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  const [synced,   setSynced]   = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const charCount = prompt.length;
  const charLimit = 4000;

  useEffect(() => {
    fetch("/api/bot/ai-config")
      .then((r) => { if (!r.ok) throw new Error("Failed to load"); return r.json(); })
      .then((data: { prompt?: string }) => {
        const p = data.prompt ?? "";
        setPrompt(p);
        setSections(parsePromptToSections(p));
      })
      .catch((err) => console.error("[ai-config] load failed:", err))
      .finally(() => setLoading(false));

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function scheduleAutoSave(value: string) {
    setSaved(false);
    setSynced(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(value), 800);
  }

  async function doSave(value: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/bot/ai-config", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ prompt: value }),
      });
      if (res.ok) setSaved(true);
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

  function updateSection(key: string, value: string) {
    setSections((prev) => {
      const updated = { ...prev, [key]: value };
      const built = SECTIONS
        .filter((s) => updated[s.key]?.trim())
        .map((s) => `[${s.label}]\n${updated[s.key]}`)
        .join("\n\n");
      setPrompt(built);
      scheduleAutoSave(built);
      return updated;
    });
  }

  function handlePromptChange(value: string) {
    setPrompt(value);
    setSections(parsePromptToSections(value));
    scheduleAutoSave(value);
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
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              Saving…
            </span>
          )}
          {saved && !saving && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><polyline points="20 6 9 17 4 12"/></svg>
              Saved
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

      {/* Mode toggle */}
      <div className="mt-5 inline-flex rounded-xl border border-rule bg-white p-1 gap-1">
        {(["simple", "advanced"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={[
              "rounded-lg px-4 py-1.5 text-sm font-semibold transition",
              mode === m ? "bg-[#1a1a1a] text-white shadow-sm" : "text-ink-muted hover:text-ink",
            ].join(" ")}
          >
            {m === "simple" ? "Section Editor" : "Full Prompt"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          {[1,2,3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-rule bg-white" />
          ))}
        </div>
      ) : (
        <div className="mt-4 flex gap-5 items-start">

          {/* Left — editor (80%) */}
          <div className="flex-[4] min-w-0">
            {mode === "simple" ? (
              <div className="space-y-3">
                {SECTIONS.map((sec) => (
                  <div key={sec.key} className="rounded-2xl border border-rule bg-white p-5">
                    <label className="flex items-center gap-2 text-sm font-semibold text-ink mb-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#10a37f]/10 text-[#10a37f]">
                        {sec.icon}
                      </span>
                      {sec.label}
                    </label>
                    <textarea
                      rows={3}
                      value={sections[sec.key] ?? ""}
                      onChange={(e) => updateSection(sec.key, e.target.value)}
                      placeholder={sec.placeholder}
                      className="w-full resize-none rounded-xl border border-rule bg-canvas px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-[#10a37f]/40 focus:outline-none focus:ring-2 focus:ring-[#10a37f]/10"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-rule bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-ink">System Prompt</p>
                  <span className={["text-xs font-mono px-2 py-0.5 rounded-lg", charCount > charLimit * 0.9 ? "bg-red-50 text-red-500" : "bg-canvas text-ink-muted"].join(" ")}>
                    {charCount} / {charLimit}
                  </span>
                </div>
                <textarea
                  rows={22}
                  value={prompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  maxLength={charLimit}
                  className="w-full resize-none rounded-xl border border-rule bg-canvas px-4 py-3 text-sm font-mono text-ink placeholder:text-ink-muted focus:border-[#10a37f]/40 focus:outline-none focus:ring-2 focus:ring-[#10a37f]/10"
                />
              </div>
            )}
          </div>

          {/* Right — preview (20%) */}
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
                    <p className="font-semibold text-[#075E54] mb-1">Matilda Cakes</p>
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
