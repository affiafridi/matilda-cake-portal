"use client";

import { useState, useEffect, useCallback } from "react";

type Field = { key: string; label: string; type?: "password" | "text" | "url"; hint?: string };

const WA_FIELDS: Field[] = [
  { key: "wa_phone_number_id",       label: "Phone Number ID",       hint: "Found in Meta Business Suite → WhatsApp → API Setup" },
  { key: "wa_business_account_id",   label: "Business Account ID",   hint: "Found in Meta Business Suite → WhatsApp → API Setup" },
  { key: "wa_access_token",          label: "Access Token",          type: "password", hint: "Permanent token from Meta — never share this" },
];

const WC_FIELDS: Field[] = [
  { key: "wc_url",             label: "Store URL",       type: "url",      hint: "Your WordPress site, e.g. https://shop.yourstore.com" },
  { key: "wc_consumer_key",    label: "Consumer Key",    type: "password", hint: "WooCommerce → Settings → Advanced → REST API" },
  { key: "wc_consumer_secret", label: "Consumer Secret", type: "password", hint: "WooCommerce → Settings → Advanced → REST API" },
];

const GOOGLE_FIELDS: Field[] = [
  { key: "google_oauth_client_id",     label: "OAuth Client ID",     hint: "Google Cloud Console → Credentials → OAuth 2.0 Client ID" },
  { key: "google_oauth_client_secret", label: "OAuth Client Secret", type: "password", hint: "Google Cloud Console → Credentials → OAuth 2.0 Client Secret" },
];

const BOT_FIELDS: Field[] = [
  { key: "bot_url",              label: "Bot Server URL",        type: "url",      hint: "URL of your Python bot server" },
  { key: "sync_secret",         label: "Sync Secret",           type: "password", hint: "Shared secret for portal ↔ bot sync requests" },
  { key: "inbox_webhook_secret", label: "Inbox Webhook Secret", type: "password", hint: "Shared secret for bot → portal inbox webhook" },
];

type SaveState = "idle" | "saving" | "saved" | "error";

function Section({
  title, icon, fields, values, onChange, onSave, saveState,
}: {
  title: string;
  icon: React.ReactNode;
  fields: Field[];
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
  onSave: () => void;
  saveState: SaveState;
}) {
  return (
    <div className="rounded-xl border border-rule bg-surface p-6 shadow-sm space-y-4">
      <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-ink-muted mb-1">{f.label}</label>
            <input
              type={f.type === "password" ? "password" : f.type === "url" ? "url" : "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              placeholder={f.type === "password" ? "••••••••••••" : f.type === "url" ? "https://" : ""}
              autoComplete="off"
              className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            {f.hint && <p className="mt-1 text-[11px] text-ink-muted">{f.hint}</p>}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={saveState === "saving"}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark transition disabled:opacity-50"
        >
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Error — retry" : "Save"}
        </button>
        {saveState === "error" && (
          <span className="text-xs text-red-500">Something went wrong. Check values and try again.</span>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>;
}

function GoogleSheetsSection() {
  const [loading,        setLoading]        = useState(true);
  const [connected,      setConnected]      = useState(false);
  const [oauthReady,     setOauthReady]     = useState(false);
  const [sheets,         setSheets]         = useState<{ id: string; name: string }[]>([]);
  const [sheetId,        setSheetId]        = useState<string | null>(null);
  const [sheetName,      setSheetName]      = useState<string | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [exporting,      setExporting]      = useState(false);
  const [disconnecting,  setDisconnecting]  = useState(false);
  const [msg,            setMsg]            = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/integrations/google/sheets").then((r) => r.json());
      if (r.ok) {
        setConnected(r.data.connected);
        setOauthReady(r.data.oauthConfigured ?? false);
        setSheets(r.data.sheets ?? []);
        setSheetId(r.data.sheetId);
        setSheetName(r.data.sheetName);
      }
    } catch { /**/ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") setMsg({ ok: true, text: "Google account connected!" });
    if (params.get("google") === "error")     setMsg({ ok: false, text: "Google connection failed. Please try again." });
    loadStatus();
  }, [loadStatus]);

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
    <div className="rounded-xl border border-rule bg-surface p-6 shadow-sm space-y-4">
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
        ) : oauthReady ? (
          <a href="/api/admin/integrations/google/connect"
            className="flex items-center gap-2 rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-dark transition shrink-0">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
              <path d="M12 0C5.372 0 0 5.373 0 12s5.372 12 12 12c6.627 0 12-5.373 12-12S18.627 0 12 0zm.14 19.018c-3.868 0-7-3.14-7-7.018 0-3.878 3.132-7.018 7-7.018 1.89 0 3.47.697 4.682 1.829l-1.974 1.978v-.004c-.735-.702-1.667-1.062-2.708-1.062-2.31 0-4.187 1.956-4.187 4.273 0 2.315 1.877 4.277 4.187 4.277 2.096 0 3.522-1.202 3.816-2.852H12.14v-2.737h6.585c.088.47.135.96.135 1.474 0 4.01-2.677 6.86-6.72 6.86z"/>
            </svg>
            Connect Google
          </a>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <button disabled
              className="flex items-center gap-2 rounded-lg bg-brand/40 px-3.5 py-1.5 text-sm font-medium text-white cursor-not-allowed shrink-0">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M12 0C5.372 0 0 5.373 0 12s5.372 12 12 12c6.627 0 12-5.373 12-12S18.627 0 12 0zm.14 19.018c-3.868 0-7-3.14-7-7.018 0-3.878 3.132-7.018 7-7.018 1.89 0 3.47.697 4.682 1.829l-1.974 1.978v-.004c-.735-.702-1.667-1.062-2.708-1.062-2.31 0-4.187 1.956-4.187 4.273 0 2.315 1.877 4.277 4.187 4.277 2.096 0 3.522-1.202 3.816-2.852H12.14v-2.737h6.585c.088.47.135.96.135 1.474 0 4.01-2.677 6.86-6.72 6.86z"/>
              </svg>
              Connect Google
            </button>
            <p className="text-[10px] text-amber-600 flex items-center gap-1">
              <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.75 10.5h-1.5v-1.5h1.5v1.5zm0-3h-1.5V4.5h1.5V8.5z"/></svg>
              Save Google OAuth credentials below first
            </p>
          </div>
        )}
      </div>

      {connected && (
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wide">
            Select sheet to sync contacts into
          </label>
          <div className="flex gap-2">
            <select value={sheetId ?? ""}
              onChange={(e) => { const s = sheets.find((s) => s.id === e.target.value); if (s) handleSelectSheet(s.id, s.name); }}
              className="flex-1 rounded-lg border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30">
              <option value="">— Choose a sheet —</option>
              {sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {saving && <div className="flex items-center px-2"><Spinner /></div>}
          </div>
          {sheetName && <p className="text-[11px] text-green-600">✓ Syncing to <strong>{sheetName}</strong> — new contacts added automatically</p>}
        </div>
      )}

      {connected && sheetId && (
        <button type="button" onClick={handleExport} disabled={exporting}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition disabled:opacity-40">
          {exporting ? <><Spinner /> Exporting…</> : "Export all contacts now"}
        </button>
      )}

      {msg && (
        <div className={`rounded-xl px-4 py-2.5 text-sm flex items-center justify-between gap-3 ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
          <span>{msg.text}</span>
          {msg.url && <a href={msg.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline underline-offset-2 shrink-0">Open Sheet →</a>}
        </div>
      )}
    </div>
  );
}

function ZohoSection() {
  return (
    <div className="rounded-xl border border-rule bg-surface p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
              <rect width="24" height="24" rx="4" fill="#E42527"/>
              <text x="3" y="17" fontSize="11" fontWeight="bold" fill="white" fontFamily="sans-serif">Z</text>
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Zoho CRM</h2>
            <p className="text-[11px] text-ink-muted">Sync contacts and leads to Zoho CRM</p>
          </div>
        </div>
        <span className="text-xs font-medium text-ink-muted bg-canvas border border-rule px-2.5 py-1 rounded-full">
          Coming soon
        </span>
      </div>
      <p className="text-xs text-ink-muted">
        Zoho CRM integration will allow automatic syncing of WhatsApp contacts and conversations as leads or contacts in your Zoho account.
      </p>
    </div>
  );
}

export default function IntegrationsPage() {
  const [values,    setValues]    = useState<Record<string, string>>({});
  const [waState,     setWaState]     = useState<SaveState>("idle");
  const [wcState,     setWcState]     = useState<SaveState>("idle");
  const [botState,    setBotState]    = useState<SaveState>("idle");
  const [googleState, setGoogleState] = useState<SaveState>("idle");

  useEffect(() => {
    fetch("/api/admin/integrations")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setValues(j.data); })
      .catch(() => {});
  }, []);

  function change(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function saveSection(fields: Field[], setState: (s: SaveState) => void) {
    setState("saving");
    try {
      for (const f of fields) {
        await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: f.key, value: values[f.key] ?? "" }),
        });
      }
      setState("saved");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  return (
    <div className="px-6 py-5 lg:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Integrations</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Configure third-party credentials. Saved securely in the database — no server restart needed.
        </p>
      </div>

      {/* ── Connected apps (2 per row) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <GoogleSheetsSection />
        <ZohoSection />
      </div>

      {/* ── API credentials (3 per row + Google OAuth) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      <Section
        title="WhatsApp Business API"
        icon={
          <svg viewBox="0 0 24 24" fill="#25D366" className="h-4 w-4" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.528 5.849L.057 23.899a.75.75 0 00.921.921l6.05-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.857a9.834 9.834 0 01-5.032-1.381l-.36-.214-3.733.907.922-3.638-.235-.374A9.857 9.857 0 012.143 12C2.143 6.55 6.55 2.143 12 2.143S21.857 6.55 21.857 12 17.45 21.857 12 21.857z"/>
          </svg>
        }
        fields={WA_FIELDS}
        values={values}
        onChange={change}
        onSave={() => saveSection(WA_FIELDS, setWaState)}
        saveState={waState}
      />

      <Section
        title="WooCommerce"
        icon={
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#7f54b3]" aria-hidden="true">
            <path fill="currentColor" d="M2.2 2h19.6C22.99 2 24 3.01 24 4.2v10.08c0 1.19-1.01 2.2-2.2 2.2H13.5l1.63 3.27-4.36-3.27H2.2C1.01 16.48 0 15.47 0 14.28V4.2C0 3.01 1.01 2 2.2 2zm2.01 3.33c-.31.04-.54.19-.65.5-.06.18-.04.37.02.56l2.18 6.93 2.27-4.46 2.27 4.46 2.18-6.93c.11-.37-.04-.75-.38-.92a.76.76 0 00-.99.34l-1.08 3.9-1.98-3.88-2.01 3.88-1.08-3.9c-.11-.36-.41-.52-.75-.48zm11.06.12c-.72.04-1.37.46-1.68 1.11-.31.66-.25 1.46.17 2.06.43.61 1.16.93 1.9.84.74-.09 1.38-.59 1.63-1.3.25-.7.08-1.49-.43-2.02a1.87 1.87 0 00-1.59-.69zm0 .98c.36-.01.71.17.91.47.2.3.24.69.09 1.02-.14.34-.46.57-.82.61-.36.04-.72-.12-.94-.42-.22-.3-.26-.7-.1-1.04.16-.34.5-.57.86-.64z"/>
          </svg>
        }
        fields={WC_FIELDS}
        values={values}
        onChange={change}
        onSave={() => saveSection(WC_FIELDS, setWcState)}
        saveState={wcState}
      />

      <Section
        title="Bot Server"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-ink-muted" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
          </svg>
        }
        fields={BOT_FIELDS}
        values={values}
        onChange={change}
        onSave={() => saveSection(BOT_FIELDS, setBotState)}
        saveState={botState}
      />

      <Section
        title="Google OAuth"
        icon={
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.372 0 0 5.373 0 12s5.372 12 12 12c6.627 0 12-5.373 12-12S18.627 0 12 0zm.14 19.018c-3.868 0-7-3.14-7-7.018 0-3.878 3.132-7.018 7-7.018 1.89 0 3.47.697 4.682 1.829l-1.974 1.978v-.004c-.735-.702-1.667-1.062-2.708-1.062-2.31 0-4.187 1.956-4.187 4.273 0 2.315 1.877 4.277 4.187 4.277 2.096 0 3.522-1.202 3.816-2.852H12.14v-2.737h6.585c.088.47.135.96.135 1.474 0 4.01-2.677 6.86-6.72 6.86z" fill="#4285F4"/>
          </svg>
        }
        fields={GOOGLE_FIELDS}
        values={values}
        onChange={change}
        onSave={() => saveSection(GOOGLE_FIELDS, setGoogleState)}
        saveState={googleState}
      />
      </div>
    </div>
  );
}
