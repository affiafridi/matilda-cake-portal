"use client";

import { useState, useEffect, useCallback } from "react";

type Settings = {
  woo_visible_to_admin:          boolean;
  wa_visible_to_admin:           boolean;
  portal_visible_to_admin:       boolean;
  integrations_visible_to_admin: boolean;
  app_name:  string;
  logo_url:  string;
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
        enabled ? "bg-[#25D366]" : "bg-[#e5e7eb]",
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
    <svg className="h-3.5 w-3.5 animate-spin text-[#9ca3af]" viewBox="0 0 24 24" fill="none">
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
    return {
      woo_visible_to_admin:          false,
      wa_visible_to_admin:           true,
      portal_visible_to_admin:       true,
      integrations_visible_to_admin: false,
      app_name: "",
      logo_url: "",
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
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function toggle(key: "woo_visible_to_admin" | "wa_visible_to_admin" | "portal_visible_to_admin" | "integrations_visible_to_admin") {
    const newValue = !settings[key];
    setSettings((prev) => ({ ...prev, [key]: newValue }));
    save(key, newValue);
  }

  const toggleRows = [
    { key: "wa_visible_to_admin"           as const, label: "WhatsApp Section",    description: "Allow Admin role to see Team Inbox, Customers, Campaigns and WA settings" },
    { key: "portal_visible_to_admin"       as const, label: "Portal Section",      description: "Allow Admin role to see Orders, Branches, Users and New Order" },
    { key: "woo_visible_to_admin"          as const, label: "WooCommerce Section", description: "Allow Admin role to see and manage Woo Categories" },
    { key: "integrations_visible_to_admin" as const, label: "Integrations",        description: "Allow Admin role to view and configure integrations (WhatsApp, WooCommerce, Google, OpenAI etc.)" },
  ];

  const inputCls = "h-9 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm text-[#0f172a] placeholder:text-[#9ca3af] focus:border-[#94a3b8] focus:outline-none transition";

  return (
    <div className="min-h-screen bg-white">

      {/* ── Tab bar ── */}
      <div className="border-b border-[#e5e7eb] px-6 lg:px-8">
        <div className="flex items-end gap-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={[
                  "flex items-center gap-2 px-3 py-3.5 text-[13px] font-medium border-b-2 transition-colors select-none",
                  active ? "border-[#0f172a] text-[#0f172a]" : "border-transparent text-[#64748b] hover:text-[#374151]",
                ].join(" ")}>
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
      <div className="px-6 pt-6 pb-10 lg:px-8">

        {/* ── Branding ── */}
        {tab === "branding" && (
          <div className="max-w-2xl space-y-5">

            {/* App Name */}
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e7eb]">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">App Name</p>
                {saving === "app_name" ? <Spinner /> : saved === "app_name" ? <Tick /> : null}
              </div>
              <div className="px-5 py-4">
                <input type="text" value={settings.app_name}
                  onChange={(e) => setSettings((p) => ({ ...p, app_name: e.target.value }))}
                  onBlur={(e) => save("app_name", e.target.value)}
                  suppressHydrationWarning
                  className={inputCls}
                  placeholder="e.g. Customer Portal" />
                <p className="mt-1.5 text-[11px] text-[#64748b]">Shown in the browser tab and login page</p>
              </div>
            </div>

            {/* Logo */}
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#e5e7eb]">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Logo</p>
              </div>
              <div className="p-5 flex gap-5 items-start">
                <label
                  onDragOver={(e) => { e.preventDefault(); setLogoDragging(true); }}
                  onDragLeave={() => setLogoDragging(false)}
                  onDrop={onLogoDrop}
                  className={["flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 transition",
                    logoDragging ? "border-[#0f172a] bg-[#f1f5f9]" : "border-[#e5e7eb] bg-white hover:border-[#94a3b8]"].join(" ")}>
                  <input type="file" accept="image/*" className="sr-only" onChange={onLogoFile} />
                  {logoUploading
                    ? <svg className="h-5 w-5 animate-spin text-[#64748b]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-[#9ca3af]"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
                  <p className="text-[13px] font-medium text-[#374151]">{logoUploading ? "Uploading…" : "Click or drag & drop"}</p>
                  <p className="text-[11px] text-[#9ca3af]">PNG, JPG, SVG · max 2 MB</p>
                </label>
                <div className="flex flex-col gap-2 w-44 shrink-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Preview</p>
                  <div className="relative flex h-20 w-full items-center justify-center rounded-lg border border-[#e5e7eb] bg-white p-3">
                    {logoRemoving
                      ? <svg className="h-5 w-5 animate-spin text-[#9ca3af]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                      : settings.logo_url
                        ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={settings.logo_url} alt="Logo" className="h-full w-full object-contain" onError={() => setSettings((p) => ({ ...p, logo_url: "" }))} />
                            <button type="button" onClick={removeLogo} title="Remove"
                              className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button></>
                        : <span className="text-[12px] text-[#9ca3af]">No logo yet</span>}
                  </div>
                  {logoError && <p className="text-[11px] text-red-500">{logoError}</p>}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── Company Profile ── */}
        {tab === "profile" && (
          <div className="max-w-2xl space-y-px">
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] overflow-hidden divide-y divide-[#e5e7eb]">
              {([
                { key: "contact_phone"         as const, label: "Phone Number",      desc: "Primary contact number",        placeholder: "+966 50 000 0000",      type: "text" },
                { key: "contact_email"         as const, label: "Email Address",     desc: "Primary contact email",         placeholder: "hello@company.com",     type: "email" },
                { key: "contact_website"       as const, label: "Website",           desc: "Company website URL",           placeholder: "https://company.com",   type: "url" },
                { key: "contact_welcome_image" as const, label: "Welcome Image URL", desc: "Shown in the bot welcome flow", placeholder: "https://…/welcome.jpg", type: "url" },
              ] as { key: keyof Settings & string; label: string; desc: string; placeholder: string; type: string }[]).map(({ key, label, desc, placeholder, type }) => (
                <div key={key} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-[13px] font-semibold text-[#0f172a]">{label}</p>
                      <p className="text-[11px] text-[#64748b] mt-0.5">{desc}</p>
                    </div>
                    {saving === key && <Spinner />}
                    {saved  === key && <Tick />}
                  </div>
                  <input type={type} value={settings[key] as string}
                    onChange={(e) => setSettings((p) => ({ ...p, [key]: e.target.value }))}
                    onBlur={(e) => save(key, e.target.value)}
                    className={inputCls}
                    placeholder={placeholder} />
                </div>
              ))}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[#0f172a]">Team Numbers</p>
                    <p className="text-[11px] text-[#64748b] mt-0.5">WhatsApp numbers used for agent handoff</p>
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
                        className={inputCls} />
                      <button type="button"
                        onClick={() => { const next = teamNumbers.filter((_, i) => i !== idx); const cleaned = next.map((n) => n.trim()).filter(Boolean); setTeamNumbers(cleaned.length ? cleaned : [""]); const joined = cleaned.join(", "); setSettings((p) => ({ ...p, contact_team_numbers: joined })); save("contact_team_numbers", joined); }}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#9ca3af] transition hover:border-red-200 hover:bg-red-50 hover:text-red-500">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setTeamNumbers((p) => [...p, ""])}
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#e5e7eb] text-[13px] text-[#64748b] hover:border-[#94a3b8] hover:text-[#374151] transition">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M12 5v14M5 12h14"/></svg>
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
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] divide-y divide-[#e5e7eb]">
              {toggleRows.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-[#0f172a]">{row.label}</p>
                      {saving === row.key && <Spinner />}
                      {saved  === row.key && <Tick />}
                    </div>
                    <p className="text-[11px] text-[#64748b] mt-0.5">{row.description}</p>
                  </div>
                  {loading
                    ? <div className="h-6 w-11 animate-pulse rounded-full bg-[#e5e7eb] shrink-0" />
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
