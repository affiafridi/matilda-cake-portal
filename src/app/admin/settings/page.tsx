"use client";

import { useState, useEffect, useCallback } from "react";

/** Computes HSL parts from a hex color. Returns null for invalid input. */
function hexToHslParts(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Applies sidebar CSS vars to the document root immediately. */
function applySidebarVarsLive(sidebarHex: string, primaryHex: string) {
  const sidebarHsl = hexToHslParts(sidebarHex);
  const sidebarL   = sidebarHsl ? sidebarHsl[2] : 100;
  const isDark     = sidebarL < 45;
  const root = document.documentElement;
  root.style.setProperty("--sb-bg",         sidebarHex);
  root.style.setProperty("--sb-fg",         isDark ? "rgba(255,255,255,0.88)" : "var(--color-ink)");
  root.style.setProperty("--sb-muted",      isDark ? "rgba(255,255,255,0.45)" : "var(--color-ink-muted)");
  root.style.setProperty("--sb-active-bg",  isDark ? "rgba(255,255,255,0.13)" : "var(--color-brand)");
  root.style.setProperty("--sb-active-fg",  "#ffffff");
  root.style.setProperty("--sb-hover-bg",   isDark ? "rgba(255,255,255,0.07)" : "var(--color-cream)");
  root.style.setProperty("--sb-border",     isDark ? "rgba(255,255,255,0.08)" : "#f0ebe4");
  root.style.setProperty("--sb-icon-bg",    isDark ? "rgba(255,255,255,0.10)" : "var(--color-cream)");
  root.style.setProperty("--sb-icon-color", isDark ? "rgba(255,255,255,0.75)" : "var(--color-brand)");
}

/** Applies accent color immediately. */
function applyAccentVarLive(hex: string) {
  if (/^#[0-9a-f]{6}$/i.test(hex))
    document.documentElement.style.setProperty("--color-gold", hex);
}

/** Applies brand CSS vars to the document root immediately — no page reload needed. */
function applyBrandVarsLive(hex: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;
  }
  const H = Math.round(h * 360), S = Math.round(s * 100), L = Math.round(l * 100);
  const dk  = Math.max(0,  L - 12);
  const ink = Math.max(0,  L - 22);
  const mut = Math.min(90, L + 20);
  const crm = Math.min(97, L + 43);
  const car = Math.min(90, L + 16);
  const root = document.documentElement;
  root.style.setProperty("--color-brand",      hex);
  root.style.setProperty("--color-brand-dark",  `hsl(${H} ${S}% ${dk}%)`);
  root.style.setProperty("--color-ink",          `hsl(${H} ${S}% ${ink}%)`);
  root.style.setProperty("--color-ink-muted",    `hsl(${H} ${Math.max(0, S - 12)}% ${mut}%)`);
  root.style.setProperty("--color-cream",        `hsl(${H} ${Math.max(0, S - 18)}% ${crm}%)`);
  root.style.setProperty("--color-caramel",      `hsl(${H} ${Math.max(0, S - 8)}% ${car}%)`);
  root.style.setProperty("--color-focus",        `hsl(${H} ${Math.max(0, S - 8)}% ${car}%)`);
}

type Settings = {
  woo_visible_to_admin:    boolean;
  wa_visible_to_admin:     boolean;
  portal_visible_to_admin: boolean;
  app_name:      string;
  primary_color: string;
  accent_color:  string;
  sidebar_color: string;
  logo_url:      string;
  contact_phone:         string;
  contact_email:         string;
  contact_website:       string;
  contact_welcome_image: string;
  contact_team_numbers:  string;
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

const TABS = [
  { id: "branding", label: "Branding",        icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  { id: "profile",  label: "Company Profile", icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" },
  { id: "access",   label: "Access Control",  icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
] as const;

type Tab = typeof TABS[number]["id"];

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<Tab>("branding");
  const [settings, setSettings] = useState<Settings>(() => {
    // Seed from CSS vars already set by SSR on <html> — avoids color flash
    const v = typeof document !== "undefined"
      ? getComputedStyle(document.documentElement)
      : null;
    const get = (name: string, fallback: string) =>
      v?.getPropertyValue(name).trim() || fallback;
    return {
      woo_visible_to_admin:    false,
      wa_visible_to_admin:     true,
      portal_visible_to_admin: true,
      app_name:      "Order Portal",
      primary_color: get("--color-brand",   "#6b2e1a"),
      accent_color:  get("--color-gold",    "#c9a535"),
      sidebar_color: get("--sb-bg",         "#ffffff"),
      logo_url:      "/uploads/logo.png",
      contact_phone:         "",
      contact_email:         "",
      contact_website:       "",
      contact_welcome_image: "",
      contact_team_numbers:  "",
    };
  });
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState<string | null>(null);
  const [saved,         setSaved]         = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoRemoving,  setLogoRemoving]  = useState(false);
  const [logoError,     setLogoError]     = useState<string | null>(null);
  const [logoDragging,  setLogoDragging]  = useState(false);
  const [teamNumbers,   setTeamNumbers]   = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((json: { ok: boolean; data: Settings }) => {
        if (json.ok && json.data) {
          setSettings(json.data);
          const nums = (json.data.contact_team_numbers ?? "")
            .split(",").map((s) => s.trim()).filter(Boolean);
          setTeamNumbers(nums.length ? nums : [""]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (key: string, value: boolean | string) => {
    setSaving(key);
    setSaved(null);
    try {
      await fetch("/api/admin/settings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ key, value }),
      });
      if (key === "primary_color" && typeof value === "string") {
        applyBrandVarsLive(value);
        applySidebarVarsLive(settings.sidebar_color, value);
      }
      if (key === "accent_color" && typeof value === "string") {
        applyAccentVarLive(value);
      }
      if (key === "sidebar_color" && typeof value === "string") {
        applySidebarVarsLive(value, settings.primary_color);
      }
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(null);
    }
  }, []);

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

  async function removeLogo() {
    setLogoError(null);
    setLogoRemoving(true);
    try {
      const res  = await fetch("/api/admin/logo", { method: "DELETE" });
      const json = await res.json() as { ok: boolean; message?: string };
      if (!res.ok || !json.ok) { setLogoError(json.message ?? "Remove failed"); return; }
      setSettings((p) => ({ ...p, logo_url: "" }));
    } catch {
      setLogoError("Network error — try again.");
    } finally {
      setLogoRemoving(false);
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

  function toggle(key: "woo_visible_to_admin" | "wa_visible_to_admin" | "portal_visible_to_admin") {
    const newValue = !settings[key];
    setSettings((prev) => ({ ...prev, [key]: newValue }));
    save(key, newValue);
  }

  const toggleRows = [
    { key: "wa_visible_to_admin"     as const, label: "WhatsApp Section", description: "Allow Admin role to see Team Inbox, Customers, Campaigns and WA settings" },
    { key: "portal_visible_to_admin" as const, label: "Portal Section",   description: "Allow Admin role to see Orders, Branches, Users and New Order" },
    { key: "woo_visible_to_admin"    as const, label: "WooCommerce Section", description: "Allow Admin role to see and manage Woo Categories" },
  ];

  return (
    <div className="min-h-screen bg-canvas">

      {/* ── Tab bar ── */}
      <div className="bg-white border-b border-rule px-6 lg:px-8">
        <div className="inline-flex items-center gap-0.5 rounded-xl bg-canvas p-1 mt-4 mb-4">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={[
                  "flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-all duration-150 select-none",
                  active
                    ? "bg-white text-brand border border-rule"
                    : "text-ink-muted hover:text-ink",
                ].join(" ")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
                  <path d={t.icon} />
                </svg>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab panels */}
      <div className="px-6 pt-5 pb-8 lg:px-8">

        {/* ── Branding ── */}
        {tab === "branding" && (
          <div className="max-w-3xl space-y-5">

            {/* App Name */}
            <div className="rounded-2xl border border-rule bg-white overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-rule bg-canvas/50">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">App Name</p>
                {saving === "app_name" ? <Spinner /> : saved === "app_name" ? <Tick /> : null}
              </div>
              <div className="px-5 py-4">
                <input type="text" value={settings.app_name}
                  onChange={(e) => setSettings((p) => ({ ...p, app_name: e.target.value }))}
                  onBlur={(e) => save("app_name", e.target.value)}
                  suppressHydrationWarning
                  className="w-full rounded-xl border border-rule bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
                  placeholder="Order Portal" />
                <p className="mt-1.5 text-xs text-ink-muted">Shown in the browser tab and login page</p>
              </div>
            </div>

            {/* Colors — 3-col grid */}
            <div className="rounded-2xl border border-rule bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-rule bg-canvas/50">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Colors</p>
              </div>
              <div className="grid grid-cols-1 divide-y divide-rule sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
                {/* Brand */}
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">Brand</p>
                      <p className="text-xs text-ink-muted">Entire UI rethemes</p>
                    </div>
                    {saving === "primary_color" ? <Spinner /> : saved === "primary_color" ? <Tick /> : null}
                  </div>
                  <label className="block cursor-pointer">
                    <div className="relative h-14 w-full rounded-xl overflow-hidden" style={{ background: settings.primary_color }}>
                      <input type="color" value={settings.primary_color}
                        onChange={(e) => { setSettings((p) => ({ ...p, primary_color: e.target.value })); applyBrandVarsLive(e.target.value); }}
                        onBlur={(e) => save("primary_color", e.target.value)}
                        suppressHydrationWarning
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                    </div>
                  </label>
                  <input type="text" value={settings.primary_color}
                    onChange={(e) => { setSettings((p) => ({ ...p, primary_color: e.target.value })); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) applyBrandVarsLive(e.target.value); }}
                    onBlur={(e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) save("primary_color", e.target.value); }}
                    suppressHydrationWarning
                    className="w-full rounded-xl border border-rule bg-canvas px-3 py-2 font-mono text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
                    placeholder="#6b2e1a" />
                </div>
                {/* Accent */}
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">Accent</p>
                      <p className="text-xs text-ink-muted">Cards, icons, links</p>
                    </div>
                    {saving === "accent_color" ? <Spinner /> : saved === "accent_color" ? <Tick /> : null}
                  </div>
                  <label className="block cursor-pointer">
                    <div className="relative h-14 w-full rounded-xl overflow-hidden" style={{ background: settings.accent_color }}>
                      <input type="color" value={settings.accent_color}
                        onChange={(e) => { setSettings((p) => ({ ...p, accent_color: e.target.value })); applyAccentVarLive(e.target.value); }}
                        onBlur={(e) => save("accent_color", e.target.value)}
                        suppressHydrationWarning
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                    </div>
                  </label>
                  <input type="text" value={settings.accent_color}
                    onChange={(e) => { setSettings((p) => ({ ...p, accent_color: e.target.value })); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) applyAccentVarLive(e.target.value); }}
                    onBlur={(e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) save("accent_color", e.target.value); }}
                    suppressHydrationWarning
                    className="w-full rounded-xl border border-rule bg-canvas px-3 py-2 font-mono text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
                    placeholder="#c9a535" />
                </div>
                {/* Sidebar */}
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">Sidebar</p>
                      <p className="text-xs text-ink-muted">Left nav background</p>
                    </div>
                    {saving === "sidebar_color" ? <Spinner /> : saved === "sidebar_color" ? <Tick /> : null}
                  </div>
                  <label className="block cursor-pointer">
                    <div className="relative h-14 w-full rounded-xl overflow-hidden border border-rule" style={{ background: settings.sidebar_color }}>
                      <input type="color" value={settings.sidebar_color}
                        onChange={(e) => { setSettings((p) => ({ ...p, sidebar_color: e.target.value })); applySidebarVarsLive(e.target.value, settings.primary_color); }}
                        onBlur={(e) => save("sidebar_color", e.target.value)}
                        suppressHydrationWarning
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                    </div>
                  </label>
                  <input type="text" value={settings.sidebar_color}
                    onChange={(e) => { setSettings((p) => ({ ...p, sidebar_color: e.target.value })); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) applySidebarVarsLive(e.target.value, settings.primary_color); }}
                    onBlur={(e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) save("sidebar_color", e.target.value); }}
                    suppressHydrationWarning
                    className="w-full rounded-xl border border-rule bg-canvas px-3 py-2 font-mono text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
                    placeholder="#ffffff" />
                  <div className="flex items-center gap-1.5">
                    {[{ label: "White", hex: "#ffffff" }, { label: "Charcoal", hex: "#1e1e2e" }, { label: "Navy", hex: "#0f172a" }, { label: "Brand", hex: settings.primary_color }].map((p) => (
                      <button key={p.hex} type="button" title={p.label}
                        onClick={() => { setSettings((s) => ({ ...s, sidebar_color: p.hex })); applySidebarVarsLive(p.hex, settings.primary_color); save("sidebar_color", p.hex); }}
                        className={["h-5 w-5 rounded-md border-2 transition hover:scale-110 shadow-sm", settings.sidebar_color === p.hex ? "border-brand" : "border-rule"].join(" ")}
                        style={{ background: p.hex }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Logo */}
            <div className="rounded-2xl border border-rule bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-rule bg-canvas/50">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Logo</p>
              </div>
              <div className="p-5 flex gap-5 items-start">
                <label
                  onDragOver={(e) => { e.preventDefault(); setLogoDragging(true); }}
                  onDragLeave={() => setLogoDragging(false)}
                  onDrop={onLogoDrop}
                  className={["flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 transition",
                    logoDragging ? "border-caramel bg-cream/30" : "border-rule bg-canvas hover:border-caramel/60 hover:bg-cream/20"].join(" ")}>
                  <input type="file" accept="image/*" className="sr-only" onChange={onLogoFile} />
                  {logoUploading
                    ? <svg className="h-6 w-6 animate-spin text-caramel" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-ink-muted"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
                  <p className="text-xs text-ink-muted font-medium">{logoUploading ? "Uploading…" : "Click or drag & drop"}</p>
                  <p className="text-[11px] text-ink-muted/60">PNG, JPG, SVG · max 2 MB</p>
                </label>
                {/* Preview */}
                <div className="flex flex-col gap-2 w-48 shrink-0">
                  <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Preview</p>
                  <div className="relative flex h-20 w-full items-center justify-center rounded-xl border border-rule bg-canvas p-2">
                    {logoRemoving
                      ? <svg className="h-5 w-5 animate-spin text-ink-muted" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                      : settings.logo_url
                        ? <><img src={settings.logo_url} alt="Logo" className="h-full w-full object-contain" />{/* eslint-disable-line @next/next/no-img-element */}
                            <button type="button" onClick={removeLogo} title="Remove" className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow-sm hover:bg-red-700 transition-colors">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button></>
                        : <span className="text-xs text-ink-muted">No logo yet</span>}
                  </div>
                  {logoError && <p className="text-xs text-danger">{logoError}</p>}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── Company Profile ── */}
        {tab === "profile" && (
          <div className="max-w-2xl">
            <div className="rounded-2xl border border-rule bg-white divide-y divide-rule">
              {([
                { key: "contact_phone"         as const, label: "Phone Number",      desc: "Primary contact number",         placeholder: "+966 50 000 0000",      type: "text" },
                { key: "contact_email"         as const, label: "Email Address",     desc: "Primary contact email",          placeholder: "hello@company.com",     type: "email" },
                { key: "contact_website"       as const, label: "Website",           desc: "Company website URL",            placeholder: "https://company.com",   type: "url" },
                { key: "contact_welcome_image" as const, label: "Welcome Image URL", desc: "Shown in the bot welcome flow",  placeholder: "https://…/welcome.jpg", type: "url" },
              ] as { key: keyof Settings & string; label: string; desc: string; placeholder: string; type: string }[]).map(({ key, label, desc, placeholder, type }) => (
                <div key={key} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">{label}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{desc} · <span className="font-mono">{`{${key}}`}</span></p>
                    </div>
                    {saving === key && <Spinner />}
                    {saved  === key && <Tick />}
                  </div>
                  <input type={type} value={settings[key] as string}
                    onChange={(e) => setSettings((p) => ({ ...p, [key]: e.target.value }))}
                    onBlur={(e) => save(key, e.target.value)}
                    className="w-full rounded-xl border border-rule bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
                    placeholder={placeholder} />
                </div>
              ))}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">Team Numbers</p>
                    <p className="text-xs text-ink-muted mt-0.5">WhatsApp numbers used for agent handoff</p>
                  </div>
                  {saving === "contact_team_numbers" && <Spinner />}
                  {saved  === "contact_team_numbers" && <Tick />}
                </div>
                <div className="space-y-2">
                  {teamNumbers.map((num, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input type="text" value={num} placeholder="+966500000001"
                        onChange={(e) => { const next = teamNumbers.map((n, i) => i === idx ? e.target.value : n); setTeamNumbers(next); }}
                        onBlur={() => { const cleaned = teamNumbers.map((n) => n.trim()).filter(Boolean); const joined = cleaned.join(", "); setSettings((p) => ({ ...p, contact_team_numbers: joined })); save("contact_team_numbers", joined); }}
                        className="flex-1 rounded-xl border border-rule bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20" />
                      <button type="button"
                        onClick={() => { const next = teamNumbers.filter((_, i) => i !== idx); const cleaned = next.map((n) => n.trim()).filter(Boolean); setTeamNumbers(cleaned.length ? cleaned : [""]); const joined = cleaned.join(", "); setSettings((p) => ({ ...p, contact_team_numbers: joined })); save("contact_team_numbers", joined); }}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rule bg-canvas text-ink-muted transition hover:border-danger/40 hover:bg-red-50 hover:text-danger">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setTeamNumbers((p) => [...p, ""])}
                    className="flex items-center gap-1.5 rounded-xl border border-dashed border-rule px-3.5 py-2 text-sm text-ink-muted transition hover:border-caramel/50 hover:text-caramel w-full justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M12 5v14M5 12h14"/></svg>
                    Add number
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Access Control ── */}
        {tab === "access" && (
          <div className="max-w-2xl">
            <div className="rounded-2xl border border-rule bg-white divide-y divide-rule">
              {toggleRows.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-4 px-5 py-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{row.label}</p>
                      {saving === row.key && <Spinner />}
                      {saved  === row.key && <Tick />}
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5">{row.description}</p>
                  </div>
                  {loading
                    ? <div className="h-6 w-11 animate-pulse rounded-full bg-rule shrink-0" />
                    : <Toggle enabled={settings[row.key]} onChange={() => toggle(row.key)} />}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
