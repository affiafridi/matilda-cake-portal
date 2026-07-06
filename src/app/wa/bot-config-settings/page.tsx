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

// ── Team Numbers Repeater ─────────────────────────────────────────────────

function TeamNumbersRepeater({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [items, setItems] = useState<string[]>([""]);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!synced && value) {
      const nums = value.split(",").map((s) => s.trim()).filter(Boolean);
      if (nums.length > 0) { setItems(nums); setSynced(true); }
    }
  }, [value, synced]);

  function update(idx: number, val: string) {
    const next = [...items]; next[idx] = val; setItems(next);
    onChange(next.filter(Boolean).join(","));
  }
  function add() { setItems((p) => [...p, ""]); }
  function remove(idx: number) {
    const next = items.filter((_, i) => i !== idx);
    const final = next.length > 0 ? next : [""];
    setItems(final);
    onChange(final.filter(Boolean).join(","));
  }

  return (
    <div className="space-y-2">
      {items.map((num, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs text-ink-muted font-mono w-5 text-right shrink-0">{idx + 1}.</span>
          <input value={num} onChange={(e) => update(idx, e.target.value)} placeholder="971501234567"
            className="flex-1 rounded-lg border border-rule bg-canvas px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-brand/30" />
          <button type="button" onClick={() => remove(idx)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rule text-ink-muted hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-rule px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-brand hover:text-brand transition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M12 5v14M5 12h14"/></svg>
        Add number
      </button>
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
  const [shop,     setShop]     = useState<Shop>(DEFAULT_SHOP);
  const [savedShop, setSavedShop] = useState<Shop>(DEFAULT_SHOP);
  const [shopState, setShopState] = useState<SaveState>("idle");

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
        const s = j.data.shop as Shop;
        setShop(s); setSavedShop(s);
        setKeywords(j.data.keywords as Keyword[]);
        const reps = j.data.replies as Reply[];
        setReplies(reps); setSavedReplies(reps);
      })
      .catch(() => {});
  }, []);

  // ── Shop save ────────────────────────────────────────────────────────────

  const shopDirty = JSON.stringify(shop) !== JSON.stringify(savedShop);

  async function saveShop() {
    setShopState("saving");
    try {
      await fetch("/api/admin/bot-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "shop", data: shop }),
      });
      setSavedShop(shop);
      setShopState("saved");
      setTimeout(() => setShopState("idle"), 2500);
    } catch { setShopState("error"); setTimeout(() => setShopState("idle"), 3000); }
  }

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

      {/* ── Row 1: Contact Info + Team Numbers ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Contact Info */}
        <div className="lg:col-span-2 rounded-xl border border-rule bg-surface p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Contact Info</h2>
            <SaveBtn state={shopState} dirty={shopDirty} onClick={saveShop} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Phone" hint="e.g. +971 50 123 4567">
              <input value={shop.phone} onChange={(e) => setShop((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+971 50 123 4567" className={INPUT} />
            </Field>
            <Field label="Email">
              <input value={shop.email} onChange={(e) => setShop((p) => ({ ...p, email: e.target.value }))}
                placeholder="order@yourstore.com" className={INPUT} />
            </Field>
            <Field label="Website">
              <input value={shop.website} onChange={(e) => setShop((p) => ({ ...p, website: e.target.value }))}
                placeholder="https://yourstore.com" className={INPUT} />
            </Field>
            <Field label="Welcome Image URL" hint="Image sent on first message">
              <input value={shop.welcomeImage} onChange={(e) => setShop((p) => ({ ...p, welcomeImage: e.target.value }))}
                placeholder="https://yourstore.com/welcome.jpg" className={INPUT} />
            </Field>
          </div>
        </div>

        {/* Team Numbers */}
        <div className="rounded-xl border border-rule bg-surface p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Team Numbers</h2>
            <SaveBtn state={shopState} dirty={shopDirty} onClick={saveShop} />
          </div>
          <p className="text-[11px] text-ink-muted">Bot will NOT reply to these. No spaces or +.</p>
          <TeamNumbersRepeater
            value={shop.teamNumbers}
            onChange={(v) => setShop((p) => ({ ...p, teamNumbers: v }))}
          />
        </div>

      </div>

      {/* ── Row 2: Keywords ── */}
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

    </div>
  );
}
