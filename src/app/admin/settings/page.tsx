"use client";

import { useState, useEffect } from "react";

type Settings = {
  woo_visible_to_admin: boolean;
  ai_visible_to_admin:  boolean;
  app_name:      string;
  primary_color: string;
  logo_url:      string;
};

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
        enabled ? "bg-[#25D366]" : "bg-rule",
      ].join(" ")}
    >
      <span className={[
        "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200",
        enabled ? "translate-x-5" : "translate-x-0",
      ].join(" ")} />
    </button>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin text-ink-muted" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    woo_visible_to_admin: false,
    ai_visible_to_admin:  false,
    app_name:      "Order Portal",
    primary_color: "#6b2e1a",
    logo_url:      "/uploads/logo.png",
  });
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState<string | null>(null);
  const [saved,         setSaved]         = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError,     setLogoError]     = useState<string | null>(null);
  const [logoDragging,  setLogoDragging]  = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((json: { ok: boolean; data: Settings }) => {
        if (json.ok && json.data) setSettings(json.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function save(key: string, value: boolean | string) {
    setSaving(key);
    setSaved(null);
    try {
      await fetch("/api/admin/settings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ key, value }),
      });
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(null);
    }
  }

  async function uploadLogo(file: File) {
    setLogoError(null);
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/admin/logo", { method: "POST", body: fd });
      const json = await res.json() as { ok: boolean; data?: { logo_url: string }; message?: string };
      if (!res.ok || !json.ok) {
        setLogoError(json.message ?? "Upload failed");
        return;
      }
      // Bust the cache so the new logo shows immediately
      const busted = `/api/admin/logo?v=${Date.now()}`;
      setSettings((p) => ({ ...p, logo_url: busted }));
    } catch {
      setLogoError("Network error — try again.");
    } finally {
      setLogoUploading(false);
    }
  }

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadLogo(file);
    e.target.value = "";
  }

  function onLogoDrop(e: React.DragEvent) {
    e.preventDefault();
    setLogoDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadLogo(file);
  }

  function toggle(key: "woo_visible_to_admin" | "ai_visible_to_admin") {
    const newValue = !settings[key];
    setSettings((prev) => ({ ...prev, [key]: newValue }));
    save(key, newValue);
  }

  const toggleRows = [
    { key: "woo_visible_to_admin" as const, label: "WooCommerce Section", description: "Allow Admin role to see and manage Woo Categories" },
    { key: "ai_visible_to_admin"  as const, label: "AI Bot Section",       description: "Allow Admin role to see AI Instructions and Keyword Manager" },
  ];

  return (
    <div className="px-6 py-5 lg:px-8 max-w-2xl space-y-8">

      {/* ── Brand Configuration ── */}
      <div>
        <div className="mb-4">
          <h1 className="text-xl font-bold text-ink">Portal Settings</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Customize branding and access controls.</p>
        </div>

        <div className="rounded-2xl border border-rule bg-white divide-y divide-rule">
          {/* App name */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-ink">App Name</p>
                <p className="text-xs text-ink-muted mt-0.5">Shown in the browser tab and login page</p>
              </div>
              {saving === "app_name" && <Spinner />}
              {saved  === "app_name" && <Tick />}
            </div>
            <input
              type="text"
              value={settings.app_name}
              onChange={(e) => setSettings((p) => ({ ...p, app_name: e.target.value }))}
              onBlur={(e) => save("app_name", e.target.value)}
              suppressHydrationWarning
              className="w-full rounded-xl border border-rule bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
              placeholder="Order Portal"
            />
          </div>

          {/* Primary color */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-ink">Brand Color</p>
                <p className="text-xs text-ink-muted mt-0.5">Primary color — entire UI rethemes automatically</p>
              </div>
              {saving === "primary_color" && <Spinner />}
              {saved  === "primary_color" && <Tick />}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.primary_color}
                onChange={(e) => setSettings((p) => ({ ...p, primary_color: e.target.value }))}
                onBlur={(e) => save("primary_color", e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-rule bg-canvas p-0.5"
              />
              <input
                type="text"
                value={settings.primary_color}
                onChange={(e) => setSettings((p) => ({ ...p, primary_color: e.target.value }))}
                onBlur={(e) => {
                  if (/^#[0-9a-f]{6}$/i.test(e.target.value)) save("primary_color", e.target.value);
                }}
                suppressHydrationWarning
                className="w-32 rounded-xl border border-rule bg-canvas px-3.5 py-2.5 font-mono text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
                placeholder="#6b2e1a"
              />
              <div className="h-10 w-10 rounded-xl border border-rule" style={{ background: settings.primary_color }} />
            </div>
          </div>

          {/* Logo upload */}
          <div className="px-5 py-4">
            <p className="text-sm font-semibold text-ink mb-0.5">Logo</p>
            <p className="text-xs text-ink-muted mb-3">JPG, PNG, WebP or SVG — max 2 MB</p>

            <div className="flex items-center gap-4">
              {/* Drop zone */}
              <label
                onDragOver={(e) => { e.preventDefault(); setLogoDragging(true); }}
                onDragLeave={() => setLogoDragging(false)}
                onDrop={onLogoDrop}
                className={[
                  "relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-5 transition",
                  logoDragging
                    ? "border-caramel bg-cream/30"
                    : "border-rule bg-canvas hover:border-caramel/60 hover:bg-cream/20",
                ].join(" ")}
              >
                <input type="file" accept="image/*" className="sr-only" onChange={onLogoFile} />
                {logoUploading ? (
                  <svg className="h-6 w-6 animate-spin text-caramel" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-ink-muted">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                )}
                <p className="text-xs text-ink-muted text-center">
                  {logoUploading ? "Uploading…" : "Click to upload or drag & drop"}
                </p>
              </label>

              {/* Current logo preview */}
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-rule bg-white p-2">
                {settings.logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={settings.logo_url}
                    alt="Current logo"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-ink-muted text-center">No logo</span>
                )}
              </div>
            </div>

            {logoError && (
              <p className="mt-2 text-xs text-danger">{logoError}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Access Control ── */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-bold text-ink">Access Control</h2>
          <p className="mt-0.5 text-sm text-ink-muted">Control which sections are visible to Admin users.</p>
        </div>

        <div className="rounded-2xl border border-rule bg-white divide-y divide-rule">
          {toggleRows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{row.label}</p>
                  {saving === row.key && <Spinner />}
                  {saved  === row.key && <Tick />}
                </div>
                <p className="text-xs text-ink-muted mt-0.5">{row.description}</p>
              </div>
              {loading ? (
                <div className="h-6 w-11 animate-pulse rounded-full bg-rule" />
              ) : (
                <Toggle enabled={settings[row.key]} onChange={() => toggle(row.key)} />
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Super Admin always has access to all sections regardless of these settings.
        </p>
      </div>
    </div>
  );
}
