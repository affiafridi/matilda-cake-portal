"use client";

import { useState, useEffect } from "react";

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

export default function IntegrationsPage() {
  const [values,    setValues]    = useState<Record<string, string>>({});
  const [waState,   setWaState]   = useState<SaveState>("idle");
  const [wcState,   setWcState]   = useState<SaveState>("idle");
  const [botState,  setBotState]  = useState<SaveState>("idle");

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
    <div className="px-6 py-5 lg:px-8 max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Integrations</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Configure third-party credentials. Saved securely in the database — no server restart needed.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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
      </div>
    </div>
  );
}
