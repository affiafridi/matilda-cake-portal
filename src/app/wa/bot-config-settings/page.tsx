"use client";

import { useState, useEffect, useRef } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";

// ── Types ─────────────────────────────────────────────────────────────────

type Shop = {
  phone: string; email: string; website: string;
  welcomeImage: string; teamNumbers: string;
};

type Keyword = { id: number; word: string; type: string };

type Reply = { id: number; key: string; bodyEn: string; bodyAr: string };

const REPLY_KEYS = ["fallback", "handoff", "error", "non_text"] as const;
const REPLY_LABELS: Record<string, string> = {
  fallback: "Fallback",
  handoff:  "Handoff",
  error:    "Error",
  non_text: "Non-text",
};
const REPLY_HINTS: Record<string, string> = {
  fallback: "Bot doesn't understand",
  handoff:  "Customer asked for human",
  error:    "Something went wrong",
  non_text: "Customer sent image/voice",
};

const DEFAULT_SHOP: Shop = { phone: "", email: "", website: "", welcomeImage: "", teamNumbers: "" };

// ── Small helpers ─────────────────────────────────────────────────────────

function SaveBtn({ state, dirty, onClick }: { state: SaveState; dirty: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={state === "saving" || !dirty}
      className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark transition disabled:opacity-40 disabled:cursor-not-allowed">
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : state === "error" ? "Error" : "Save"}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}

const INPUT  = "w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30";
const MONO   = `${INPUT} font-mono`;

// ── Placeholder chips ─────────────────────────────────────────────────────

const PLACEHOLDERS = [
  { key: "{contact_phone}",   cfgKey: "phone"   as keyof Shop },
  { key: "{contact_email}",   cfgKey: "email"   as keyof Shop },
  { key: "{contact_website}", cfgKey: "website" as keyof Shop },
];

function PlaceholderChips({ shop, onInsert }: { shop: Shop; onInsert: (p: string) => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  function handle(p: string) {
    onInsert(p);
    navigator.clipboard.writeText(p).catch(() => {});
    setCopied(p);
    setTimeout(() => setCopied(null), 1500);
  }
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      <span className="text-[10px] text-ink-muted self-center">Insert:</span>
      {PLACEHOLDERS.map(({ key, cfgKey }) => (
        <div key={key} className="relative group">
          <button type="button" onClick={() => handle(key)}
            className="rounded border border-rule bg-canvas px-2 py-0.5 font-mono text-[11px] text-brand hover:bg-brand/5 hover:border-brand transition">
            {copied === key ? "Copied!" : key}
          </button>
          {shop[cfgKey] && (
            <div className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-10 hidden group-hover:flex">
              <span className="whitespace-nowrap rounded bg-ink px-2 py-1 text-[10px] text-white shadow-lg">
                → {shop[cfgKey]}
              </span>
              <span className="absolute left-3 top-full border-4 border-transparent border-t-ink" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Keywords manager ──────────────────────────────────────────────────────

function KeywordsManager({ keywords, onAdd, onDelete }: {
  keywords: Keyword[];
  onAdd: (word: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const word = draft.trim();
    if (!word) return;
    setAdding(true);
    await onAdd(word);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw) => (
          <span key={kw.id} className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-canvas px-2.5 py-1 text-xs font-mono text-ink max-w-xs">
            <span className="truncate">{kw.word}</span>
            <button type="button" onClick={() => onDelete(kw.id)}
              className="ml-0.5 text-ink-muted hover:text-red-500 transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </span>
        ))}
        {keywords.length === 0 && <p className="text-[11px] text-ink-muted">No keywords yet.</p>}
      </div>
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Type keyword + Enter" className={`${INPUT} text-xs font-mono`} />
        <button type="button" onClick={handleAdd} disabled={adding || !draft.trim()}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-dark transition">
          {adding ? "…" : "Add"}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function BotConfigSettingsPage() {
  const [shop, setShop] = useState<Shop>(DEFAULT_SHOP);

  const [keywords, setKeywords] = useState<Keyword[]>([]);

  const [replies,     setReplies]     = useState<Reply[]>([]);
  const [savedReplies, setSavedReplies] = useState<Reply[]>([]);
  // track save state per reply key
  const [replyStates, setReplyStates] = useState<Record<string, SaveState>>({});

  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    fetch("/api/admin/bot-config")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        setShop(j.data.shop as Shop);
        setKeywords(j.data.keywords as Keyword[]);
        const reps = j.data.replies as Reply[];
        setReplies(reps); setSavedReplies(reps);
      })
      .catch(() => {});
  }, []);

  // ── Keywords ─────────────────────────────────────────────────────────────

  async function addKeyword(word: string) {
    const res = await fetch("/api/admin/bot-config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "keyword_add", data: { word } }),
    });
    const j = await res.json();
    if (j.ok) setKeywords((prev) => [...prev, j.data as Keyword]);
  }

  async function deleteKeyword(id: number) {
    await fetch("/api/admin/bot-config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "keyword_delete", data: { id: String(id) } }),
    });
    setKeywords((prev) => prev.filter((k) => k.id !== id));
  }

  // ── Replies ──────────────────────────────────────────────────────────────

  function setReply(key: string, field: "bodyEn" | "bodyAr", val: string) {
    setReplies((prev) => {
      const exists = prev.some((r) => r.key === key);
      if (exists) return prev.map((r) => r.key === key ? { ...r, [field]: val } : r);
      return [...prev, { id: 0, key, bodyEn: field === "bodyEn" ? val : "", bodyAr: field === "bodyAr" ? val : "" }];
    });
  }

  function getReply(key: string): Reply {
    return replies.find((r) => r.key === key) ?? { id: 0, key, bodyEn: "", bodyAr: "" };
  }

  function getSavedReply(key: string): Reply {
    return savedReplies.find((r) => r.key === key) ?? { id: 0, key, bodyEn: "", bodyAr: "" };
  }

  function isReplyDirty(key: string) {
    const cur = getReply(key); const sav = getSavedReply(key);
    return cur.bodyEn !== sav.bodyEn || cur.bodyAr !== sav.bodyAr;
  }

  async function saveReply(key: string) {
    setReplyStates((p) => ({ ...p, [key]: "saving" }));
    const r = getReply(key);
    try {
      await fetch("/api/admin/bot-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "reply", data: { key, bodyEn: r.bodyEn, bodyAr: r.bodyAr } }),
      });
      setSavedReplies((prev) => prev.map((s) => s.key === key ? { ...s, bodyEn: r.bodyEn, bodyAr: r.bodyAr } : s));
      setReplyStates((p) => ({ ...p, [key]: "saved" }));
      setTimeout(() => setReplyStates((p) => ({ ...p, [key]: "idle" })), 2500);
    } catch {
      setReplyStates((p) => ({ ...p, [key]: "error" }));
      setTimeout(() => setReplyStates((p) => ({ ...p, [key]: "idle" })), 3000);
    }
  }

  function insertAt(key: string, field: "bodyEn" | "bodyAr", placeholder: string) {
    const el = textareaRefs.current[`${key}_${field}`];
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const next  = el.value.slice(0, start) + placeholder + el.value.slice(end);
    setReply(key, field, next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  }

  return (
    <div className="px-6 py-5 lg:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Bot Config</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Manage dynamic bot settings. After saving, hit <strong>Reload Bot</strong> in Woo Categories to apply.
        </p>
      </div>

      {/* Locked notice */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-amber-500 shrink-0 mt-0.5">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <div>
          <p className="text-sm font-semibold text-amber-800">This page is temporarily locked</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Bot Config is under review while we evaluate what&apos;s still needed alongside the Flow Builder. It will be unlocked or redesigned shortly.
          </p>
        </div>
      </div>

      <div className="pointer-events-none opacity-40 space-y-6">

      {/* ── Row 1: Keywords ── */}
      <div className="rounded-xl border border-rule bg-surface p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Handoff Keywords</h2>
            <p className="text-[11px] text-ink-muted mt-0.5">When customer types any of these, bot routes to a human agent.</p>
          </div>
        </div>
        <KeywordsManager keywords={keywords} onAdd={addKeyword} onDelete={deleteKeyword} />
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
          Menu & custom flow keywords stay in Python — they depend on business logic.
        </div>
      </div>

      {/* ── Row 3: Bot Replies ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {REPLY_KEYS.map((key) => {
          const r    = getReply(key);
          const st   = replyStates[key] ?? "idle";
          const dirty = isReplyDirty(key);
          return (
            <div key={key} className="rounded-xl border border-rule bg-surface p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-ink">{REPLY_LABELS[key]}</h2>
                  <p className="text-[11px] text-ink-muted">{REPLY_HINTS[key]}</p>
                </div>
                <SaveBtn state={st} dirty={dirty} onClick={() => saveReply(key)} />
              </div>
              <Field label="English">
                <textarea
                  ref={(el) => { textareaRefs.current[`${key}_bodyEn`] = el; }}
                  value={r.bodyEn}
                  onChange={(e) => setReply(key, "bodyEn", e.target.value)}
                  rows={4} className={`${MONO} resize-none`} />
                <PlaceholderChips shop={shop} onInsert={(p) => insertAt(key, "bodyEn", p)} />
              </Field>
              <Field label="Arabic (optional)">
                <textarea
                  ref={(el) => { textareaRefs.current[`${key}_bodyAr`] = el; }}
                  value={r.bodyAr}
                  onChange={(e) => setReply(key, "bodyAr", e.target.value)}
                  rows={4} dir="rtl" className={`${MONO} resize-none`} />
                <PlaceholderChips shop={shop} onInsert={(p) => insertAt(key, "bodyAr", p)} />
              </Field>
            </div>
          );
        })}
      </div>

      </div>{/* end locked wrapper */}

    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>;
}

function GoogleSheetsSection() {
  const [loading,     setLoading]     = useState(true);
  const [connected,   setConnected]   = useState(false);
  const [sheets,      setSheets]      = useState<{ id: string; name: string }[]>([]);
  const [sheetId,     setSheetId]     = useState<string | null>(null);
  const [sheetName,   setSheetName]   = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [msg,         setMsg]         = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  useEffect(() => {
    // Check for redirect result from OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") setMsg({ ok: true, text: "Google account connected!" });
    if (params.get("google") === "error")     setMsg({ ok: false, text: "Google connection failed. Please try again." });
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/integrations/google/sheets").then((r) => r.json());
      if (r.ok) {
        setConnected(r.data.connected);
        setSheets(r.data.sheets ?? []);
        setSheetId(r.data.sheetId);
        setSheetName(r.data.sheetName);
      }
    } catch { /**/ }
    setLoading(false);
  }

  async function handleSelectSheet(id: string, name: string) {
    setSaving(true);
    await fetch("/api/admin/integrations/google/sheets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    setSheetId(id); setSheetName(name); setSaving(false);
    setMsg({ ok: true, text: `Sheet "${name}" selected` });
  }

  async function handleExport() {
    setExporting(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/customers/export-sheets", { method: "POST" }).then((r) => r.json());
      if (r.ok) setMsg({ ok: true, text: `${r.data.count} contacts exported`, url: r.data.sheetUrl });
      else setMsg({ ok: false, text: r.error ?? "Export failed" });
    } catch { setMsg({ ok: false, text: "Export failed" }); }
    setExporting(false);
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Google Sheets? Auto-sync will stop.")) return;
    setDisconnecting(true);
    await fetch("/api/admin/integrations/google/disconnect", { method: "POST" });
    setConnected(false); setSheets([]); setSheetId(null); setSheetName(null);
    setMsg({ ok: true, text: "Google account disconnected" });
    setDisconnecting(false);
  }

  return (
    <div className="rounded-2xl border border-rule bg-surface p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-green-600" fill="currentColor">
              <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Google Sheets</h2>
            <p className="text-[11px] text-ink-muted">Sync WhatsApp contacts automatically</p>
          </div>
        </div>

        {loading ? <Spinner /> : connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" /> Connected
            </span>
            <button type="button" onClick={handleDisconnect} disabled={disconnecting}
              className="text-xs text-ink-muted hover:text-red-500 transition">
              {disconnecting ? "…" : "Disconnect"}
            </button>
          </div>
        ) : (
          <a href="/api/admin/integrations/google/connect"
            className="flex items-center gap-2 rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-dark transition shrink-0">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
              <path d="M12 0C5.372 0 0 5.373 0 12s5.372 12 12 12c6.627 0 12-5.373 12-12S18.627 0 12 0zm.14 19.018c-3.868 0-7-3.14-7-7.018 0-3.878 3.132-7.018 7-7.018 1.89 0 3.47.697 4.682 1.829l-1.974 1.978v-.004c-.735-.702-1.667-1.062-2.708-1.062-2.31 0-4.187 1.956-4.187 4.273 0 2.315 1.877 4.277 4.187 4.277 2.096 0 3.522-1.202 3.816-2.852H12.14v-2.737h6.585c.088.47.135.96.135 1.474 0 4.01-2.677 6.86-6.72 6.86z"/>
            </svg>
            Connect Google
          </a>
        )}
      </div>

      {/* Sheet picker — shown after connected */}
      {connected && (
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wide">
            Select sheet to sync contacts into
          </label>
          <div className="flex gap-2">
            <select
              value={sheetId ?? ""}
              onChange={(e) => {
                const selected = sheets.find((s) => s.id === e.target.value);
                if (selected) handleSelectSheet(selected.id, selected.name);
              }}
              className="flex-1 rounded-xl border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30">
              <option value="">— Choose a sheet —</option>
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {saving && <div className="flex items-center px-2"><Spinner /></div>}
          </div>
          {sheetName && (
            <p className="text-[11px] text-green-600">
              ✓ Syncing to <strong>{sheetName}</strong> — new contacts added automatically
            </p>
          )}
        </div>
      )}

      {/* Export button — shown when sheet is selected */}
      {connected && sheetId && (
        <button type="button" onClick={handleExport} disabled={exporting}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition disabled:opacity-40">
          {exporting ? <><Spinner /> Exporting…</> : "Export all contacts now"}
        </button>
      )}

      {/* Result message */}
      {msg && (
        <div className={`rounded-xl px-4 py-2.5 text-sm flex items-center justify-between gap-3 ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
          <span>{msg.text}</span>
          {msg.url && (
            <a href={msg.url} target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold underline underline-offset-2 shrink-0">Open Sheet →</a>
          )}
        </div>
      )}
    </div>
  );
}
