"use client";

import { useEffect, useState, useRef, useCallback } from "react";

type Cred = { label: string; env: string; value: string };

type WaProfile = {
  verified_name:                string;
  display_phone_number:         string;
  phone_number_id:              string;
  username:                     string | null;
  is_official_business_account: boolean;
  quality_rating:               string | null;
  messaging_limit_tier:         string | null;
  status:                       string | null;
  throughput:                   string | null;
  profile_picture_url:          string | null;
  about:       string;
  description: string;
  address:     string;
  email:       string;
  websites:    string[];
  vertical:    string;
};

const VERTICAL_LABELS: Record<string, string> = {
  OTHER:          "Other",
  AUTO:           "Automotive",
  BEAUTY:         "Beauty & Personal Care",
  APPAREL:        "Clothing & Apparel",
  EDU:            "Education",
  ENTERTAIN:      "Entertainment",
  EVENT_PLAN:     "Event Planning",
  FINANCE:        "Finance & Banking",
  GROCERY:        "Grocery & Food",
  GOVT:           "Government & Politics",
  HOTEL:          "Hotel & Hospitality",
  HEALTH:         "Health & Medical",
  NONPROFIT:      "Non-Profit",
  PROF_SERVICES:  "Professional Services",
  RETAIL:         "Retail",
  TRAVEL:         "Travel & Transportation",
  RESTAURANT:     "Restaurant & Food Service",
  NOT_A_BIZ:      "Not a Business",
};

const VERTICALS = Object.keys(VERTICAL_LABELS).filter((v) => v !== "UNDEFINED");

const TABS = [
  { id: "profile",     label: "Channel Profile", icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z" },
  { id: "template",    label: "Re-engagement",   icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" },
  { id: "credentials", label: "API Credentials", icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" },
] as const;

type Tab = typeof TABS[number]["id"];

function Spinner({ size = "sm" }: { size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <svg className={`${cls} animate-spin text-[#9ca3af]`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

// ── Searchable Category Dropdown ──────────────────────────────────────────────
function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  const filtered = VERTICALS.filter((v) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return v.toLowerCase().includes(q) || VERTICAL_LABELS[v].toLowerCase().includes(q);
  });

  const select = useCallback((v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  }, [onChange]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus search when opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
    if (e.key === "Enter" && filtered.length === 1) select(filtered[0]);
  }

  const label = value ? (VERTICAL_LABELS[value] ?? value.replace(/_/g, " ")) : "Select category…";

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "w-full flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm transition",
          "focus:outline-none",
          open ? "border-[#94a3b8] bg-white" : "border-[#e5e7eb] bg-white hover:border-[#94a3b8]",
          value ? "text-[#0f172a]" : "text-[#9ca3af]",
        ].join(" ")}
      >
        <span className="truncate">{label}</span>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round"
          className={["h-4 w-4 text-[#9ca3af] shrink-0 transition-transform duration-150", open ? "rotate-180" : ""].join(" ")}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-[#e5e7eb] bg-white shadow-lg overflow-hidden">
          {/* Search box */}
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] px-3 py-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[#9ca3af] shrink-0">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search categories…"
                className="flex-1 bg-transparent text-sm text-[#0f172a] placeholder:text-[#9ca3af] focus:outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="text-[#9ca3af] hover:text-[#374151]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          </div>

          {/* Options */}
          <ul className="max-h-52 overflow-y-auto pb-2">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-[#9ca3af] text-center">No results</li>
            ) : filtered.map((v) => (
              <li key={v}>
                <button
                  type="button"
                  onClick={() => select(v)}
                  className={[
                    "w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors",
                    v === value
                      ? "bg-[#0f172a]/5 text-[#0f172a] font-semibold"
                      : "text-[#374151] hover:bg-[#f6f8fa]",
                  ].join(" ")}
                >
                  <span>{VERTICAL_LABELS[v]}</span>
                  {v === value && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-[#0f172a]">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WaSettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");

  const [isSuperAdmin, setIsSuperAdmin]     = useState(false);
  const [credentials, setCredentials]       = useState<Cred[]>([]);
  const [templateName, setTemplateName]     = useState("conversation_followup");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateSaved, setTemplateSaved]   = useState(false);

  const [profile, setProfile]               = useState<WaProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError]     = useState<string | null>(null);
  const [profileSaving, setProfileSaving]   = useState(false);
  const [profileSaved,  setProfileSaved]    = useState(false);
  const [picUploading,   setPicUploading]   = useState(false);
  const [picError,       setPicError]       = useState<string | null>(null);
  const [displayNameInput,  setDisplayNameInput]  = useState("");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [displayNameSaved,  setDisplayNameSaved]  = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProfile = useCallback(() => {
    setProfileLoading(true);
    setProfileError(null);
    fetch("/api/wa/profile")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) { setProfile(j.data); }
        else setProfileError(j.error ?? "Could not load profile from Meta.");
      })
      .catch(() => setProfileError("Could not reach Meta API."))
      .finally(() => setProfileLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/wa/settings")
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setIsSuperAdmin(j.data.isSuperAdmin); setCredentials(j.data.credentials); } })
      .catch(() => {});

    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((j) => { if (j.ok && j.data.inbox_template_name) setTemplateName(j.data.inbox_template_name); })
      .catch(() => {});

    loadProfile();
  }, [loadProfile]);

  async function saveProfile() {
    if (!profile) return;
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      const res = await fetch("/api/wa/profile", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          about:       profile.about,
          description: profile.description,
          address:     profile.address,
          email:       profile.email,
          websites:    profile.websites.filter(Boolean),
          vertical:    profile.vertical,
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      setProfileSaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setProfileSaved(false), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveDisplayName() {
    if (!displayNameInput.trim()) return;
    setDisplayNameSaving(true);
    try {
      const res = await fetch("/api/wa/profile", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ display_name: displayNameInput.trim() }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      setProfile((p) => p ? { ...p, verified_name: displayNameInput.trim() } : p);
      setDisplayNameSaved(true);
      setTimeout(() => setDisplayNameSaved(false), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setDisplayNameSaving(false);
    }
  }

  async function uploadProfilePicture(file: File) {
    setPicError(null);
    setPicUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/wa/profile-picture", { method: "POST", body: fd });
      const j   = await res.json();
      if (!j.ok) { setPicError(j.error ?? "Upload failed"); return; }
      const pr = await fetch("/api/wa/profile").then((r) => r.json());
      if (pr.ok) { setProfile(pr.data); }
    } catch {
      setPicError("Network error — try again.");
    } finally {
      setPicUploading(false);
    }
  }

  async function saveTemplate() {
    if (!templateName.trim()) return;
    setTemplateSaving(true);
    try {
      await fetch("/api/admin/settings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ key: "inbox_template_name", value: templateName.trim() }),
      });
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 2500);
    } finally {
      setTemplateSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">

      {/* ── Tab bar ── */}
      <div className="border-b border-[#e5e7eb] px-6 lg:px-8">
        <div className="flex items-end gap-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={[
                  "flex items-center gap-2 px-3 py-3.5 text-[13px] font-medium border-b-2 transition-colors select-none",
                  active ? "border-[#0f172a] text-[#0f172a]" : "border-transparent text-[#64748b] hover:text-[#374151]",
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

      <div className="px-6 pt-5 pb-8 lg:px-8 max-w-4xl">

        {/* ── Channel Profile ── */}
        {tab === "profile" && (
          <>
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] overflow-hidden">
              {profileLoading ? (
                /* Skeleton */
                <div>
                  <div className="px-6 pt-6 pb-5 flex items-center gap-5 border-b border-[#e5e7eb]">
                    <div className="h-20 w-20 rounded-xl bg-[#e5e7eb] animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2.5">
                      <div className="h-5 w-44 rounded-lg bg-[#e5e7eb] animate-pulse" />
                      <div className="h-4 w-32 rounded-lg bg-[#e5e7eb] animate-pulse" />
                      <div className="h-3 w-20 rounded-lg bg-[#e5e7eb] animate-pulse" />
                    </div>
                    <div className="hidden sm:flex rounded-xl overflow-hidden border border-[#e5e7eb]">
                      {[80, 80, 80].map((_, i) => (
                        <div key={i} className="flex flex-col items-center justify-center gap-1.5 px-5 py-3 bg-white border-l border-[#e5e7eb] first:border-l-0">
                          <div className="h-2.5 w-12 rounded bg-[#e5e7eb] animate-pulse" />
                          <div className="h-4 w-10 rounded bg-[#e5e7eb] animate-pulse" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[2, 1, 1, 2, 1, 1, 2, 2].map((span, i) => (
                      <div key={i} className={`${span === 2 ? "sm:col-span-2" : ""} h-10 rounded-xl bg-[#e5e7eb] animate-pulse`} />
                    ))}
                  </div>
                  <div className="px-6 py-4 border-t border-[#e5e7eb] flex justify-end">
                    <div className="h-10 w-32 rounded-xl bg-[#e5e7eb] animate-pulse" />
                  </div>
                </div>
              ) : profileError ? (
                <div className="px-6 py-12 text-center">
                  <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-3">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                      <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-[#0f172a]">{profileError}</p>
                  <button onClick={loadProfile} className="mt-3 text-sm text-[#0f172a] hover:underline">Try again</button>
                </div>
              ) : profile && (
                <>
                  {/* ── Identity strip ── */}
                  <div className="px-6 pt-6 pb-5 flex flex-col sm:flex-row sm:items-center gap-5 border-b border-[#e5e7eb]">

                    {/* Avatar */}
                    <label className="relative shrink-0 cursor-pointer group self-start">
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadProfilePicture(f); e.target.value = ""; }} />
                      {picUploading
                        ? <div className="h-20 w-20 rounded-xl bg-[#f6f8fa] border border-[#e5e7eb] flex items-center justify-center">
                            <Spinner size="md" />
                          </div>
                        : profile.profile_picture_url
                          ? <img src={profile.profile_picture_url} alt="Profile" className="h-20 w-20 rounded-xl object-cover border border-[#e5e7eb]" /> /* eslint-disable-line @next/next/no-img-element */
                          : <div className="h-20 w-20 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center">
                              <svg viewBox="0 0 24 24" fill="#25D366" className="h-9 w-9"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>
                            </div>
                      }
                      {!picUploading && (
                        <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                          </svg>
                        </div>
                      )}
                    </label>

                    {/* Name + phone — dynamic from Meta */}
                    <div className="min-w-0 flex-1">
                      {profile.verified_name ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-lg font-bold text-[#0f172a] leading-tight">{profile.verified_name}</p>
                          {profile.is_official_business_account && (
                            <svg viewBox="0 0 24 24" fill="#1877F2" className="h-4.5 w-4.5 shrink-0"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[11px] text-amber-600 font-medium">Meta didn&apos;t return a business name. Set a display name manually:</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={displayNameInput}
                              onChange={(e) => { setDisplayNameInput(e.target.value); setDisplayNameSaved(false); }}
                              onKeyDown={(e) => { if (e.key === "Enter") saveDisplayName(); }}
                              placeholder="e.g. Matilda Cake"
                              className="h-8 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-sm text-[#0f172a] placeholder:text-[#9ca3af] focus:border-[#25D366] focus:outline-none w-48"
                            />
                            <button
                              onClick={saveDisplayName}
                              disabled={displayNameSaving || !displayNameInput.trim()}
                              className="flex h-8 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {displayNameSaving ? <Spinner /> : displayNameSaved ? <Tick /> : null}
                              {displayNameSaved ? "Saved" : "Save"}
                            </button>
                          </div>
                        </div>
                      )}

                      {profile.display_phone_number ? (
                        <p className="text-sm text-[#64748b] mt-1 font-medium">{profile.display_phone_number}</p>
                      ) : (
                        <p className="text-sm text-[#9ca3af] mt-1 font-mono text-xs">{profile.phone_number_id}</p>
                      )}

                      {profile.username && (
                        <span className="inline-flex items-center gap-1 mt-1.5 rounded-full bg-[#f1f5f9] border border-[#e5e7eb] px-2.5 py-0.5 text-[11px] font-semibold text-[#64748b]">
                          @{profile.username}
                        </span>
                      )}
                      {picError && <p className="text-xs text-red-500 mt-1.5">{picError}</p>}
                    </div>

                    {/* Health stats */}
                    <div className="flex items-stretch rounded-xl overflow-hidden border border-[#e5e7eb] shrink-0 bg-white">
                      {[
                        { label: "Status",  value: profile.status,              fallback: "Live" },
                        { label: "Quality", value: profile.quality_rating,       fallback: "Good" },
                        { label: "Limit",   value: profile.messaging_limit_tier, fallback: "Default" },
                      ].map(({ label, value, fallback }, i) => {
                        const raw = value ?? "";
                        const display = raw.replace(/^TIER_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || fallback;
                        const dot = !raw || /GREEN|CONNECTED|UNLIMITED|LIVE/i.test(raw) ? "bg-emerald-400"
                          : /YELLOW|FLAGGED/i.test(raw)                                  ? "bg-amber-400"
                          : /RED|DISCONNECTED|RESTRICTED|RATE_LIMITED/i.test(raw)        ? "bg-red-400"
                          : "bg-sky-400";
                        return (
                          <div key={label} className={["flex flex-col items-center justify-center px-5 py-3.5 min-w-[80px]", i > 0 ? "border-l border-[#e5e7eb]" : ""].join(" ")}>
                            <span className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1.5">{label}</span>
                            <div className="flex items-center gap-1.5">
                              <span className={["h-1.5 w-1.5 rounded-full shrink-0", dot].join(" ")} />
                              <span className="text-sm font-bold text-[#0f172a]">{display}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Form ── */}
                  <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">

                    {/* About */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">About</label>
                        <span className="text-[11px] text-[#9ca3af]">{profile.about.length}/139</span>
                      </div>
                      <input type="text" value={profile.about}
                        onChange={(e) => setProfile((p) => p ? { ...p, about: e.target.value } : p)}
                        maxLength={139}
                        className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm text-[#0f172a] focus:border-[#94a3b8] focus:outline-none transition"
                        placeholder="Available" />
                    </div>

                    {/* Category — searchable */}
                    <div>
                      <label className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5 block">Category</label>
                      <CategorySelect
                        value={profile.vertical}
                        onChange={(v) => setProfile((p) => p ? { ...p, vertical: v } : p)}
                      />
                    </div>

                    {/* Description — full width */}
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">Description</label>
                        <span className="text-[11px] text-[#9ca3af]">{profile.description.length}/512</span>
                      </div>
                      <textarea value={profile.description}
                        onChange={(e) => setProfile((p) => p ? { ...p, description: e.target.value } : p)}
                        rows={3} maxLength={512}
                        className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm text-[#0f172a] focus:border-[#94a3b8] focus:outline-none transition resize-none"
                        placeholder="Tell customers about your business…" />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5 block">Email</label>
                      <input type="email" value={profile.email}
                        onChange={(e) => setProfile((p) => p ? { ...p, email: e.target.value } : p)}
                        maxLength={128}
                        className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm text-[#0f172a] focus:border-[#94a3b8] focus:outline-none transition"
                        placeholder="hello@business.com" />
                    </div>

                    {/* Website */}
                    <div>
                      <label className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5 block">Website</label>
                      <input type="url" value={profile.websites[0] ?? ""}
                        onChange={(e) => { const next = [...(profile.websites ?? [])]; next[0] = e.target.value; setProfile((p) => p ? { ...p, websites: next } : p); }}
                        className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm text-[#0f172a] focus:border-[#94a3b8] focus:outline-none transition"
                        placeholder="https://yoursite.com" />
                    </div>

                    {/* Address — full width */}
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5 block">Address</label>
                      <input type="text" value={profile.address}
                        onChange={(e) => setProfile((p) => p ? { ...p, address: e.target.value } : p)}
                        maxLength={256}
                        className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm text-[#0f172a] focus:border-[#94a3b8] focus:outline-none transition"
                        placeholder="123 Main St, City, Country" />
                    </div>

                    {/* Second Website — full width */}
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5 block">
                        Second Website <span className="normal-case font-normal text-[#9ca3af]">(optional)</span>
                      </label>
                      <input type="url" value={profile.websites[1] ?? ""}
                        onChange={(e) => { const next = [...(profile.websites ?? [])]; next[1] = e.target.value; setProfile((p) => p ? { ...p, websites: next } : p); }}
                        className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm text-[#0f172a] focus:border-[#94a3b8] focus:outline-none transition"
                        placeholder="https://second-site.com" />
                    </div>
                  </div>

                  {/* ── Save bar ── */}
                  <div className="px-6 py-4 flex items-center justify-between border-t border-[#e5e7eb] bg-[#f6f8fa]">
                    {profileSaved
                      ? <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium"><Tick /> Changes saved</span>
                      : <span className="text-xs text-[#64748b]">Fields are saved together — click Save when done.</span>}
                    <button type="button" onClick={saveProfile} disabled={profileSaving}
                      className="flex items-center gap-2 rounded-xl bg-[#0f172a] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1e293b] transition disabled:opacity-50">
                      {profileSaving && <Spinner />}
                      {profileSaving ? "Saving…" : "Save Profile"}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* ── OBA card ── */}
            {!profileLoading && !profileError && profile && (
              <div className="mt-4 rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] overflow-hidden">
                <div className="flex items-start gap-4 px-5 py-5">
                  <div className={[
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    profile.is_official_business_account ? "bg-blue-50" : "bg-[#f1f5f9]",
                  ].join(" ")}>
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill={profile.is_official_business_account ? "#1877F2" : "currentColor"}>
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-[#0f172a]">Official Business Account</p>
                      {profile.is_official_business_account
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Verified
                          </span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] border border-[#e5e7eb] px-2 py-0.5 text-[11px] font-semibold text-[#64748b]">
                            Not verified
                          </span>
                      }
                    </div>
                    <p className="text-xs text-[#64748b]">
                      {profile.is_official_business_account
                        ? "Your account has a blue checkmark confirming it as an authentic and notable brand."
                        : "Get a blue checkmark to show customers your account is authentic. Requires Meta review."}
                    </p>
                  </div>
                  {!profile.is_official_business_account && (
                    <a href="https://business.facebook.com/wa/manage/phone-numbers/" target="_blank" rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#374151] hover:bg-[#f6f8fa] transition">
                      Submit request
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Re-engagement Template ── */}
        {tab === "template" && (
          <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] overflow-hidden">
            <div className="flex items-start gap-4 px-5 py-5 border-b border-[#e5e7eb]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0f172a]/8">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-[#0f172a]">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">Re-engagement Template</p>
                <p className="text-xs text-[#64748b] mt-0.5">Sent automatically when the 24-hour messaging window closes. Must be an approved template in Meta Business Suite.</p>
              </div>
            </div>
            <div className="px-5 py-5">
              <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-2">Template Name</p>
              <div className="flex items-center gap-3">
                <input type="text" value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="conversation_followup"
                  className="flex-1 rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm font-mono text-[#0f172a] focus:border-[#94a3b8] focus:outline-none transition" />
                <button type="button" onClick={saveTemplate} disabled={templateSaving}
                  className="shrink-0 flex items-center gap-2 rounded-xl bg-[#0f172a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1e293b] transition disabled:opacity-50">
                  {templateSaving && <Spinner />}
                  {templateSaved ? "Saved ✓" : templateSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── API Credentials ── */}
        {tab === "credentials" && (
          <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] overflow-hidden">
            <div className="flex items-start gap-4 px-5 py-5 border-b border-[#e5e7eb]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0f172a]/8">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-[#0f172a]">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">API Credentials</p>
                <p className="text-xs text-[#64748b] mt-0.5">Your WhatsApp Business API identifiers pulled from environment variables. Read-only — set in Cloud Run.</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-2">
              {credentials.map((item) => (
                <div key={item.env} className="flex items-center justify-between rounded-xl bg-white border border-[#e5e7eb] px-4 py-3 gap-4 overflow-hidden">
                  <div>
                    <p className="text-xs font-semibold text-[#0f172a]">{item.label}</p>
                    <p className="text-[11px] text-[#9ca3af] font-mono mt-0.5">{item.env}</p>
                  </div>
                  <code className="text-xs text-[#64748b] bg-[#f6f8fa] border border-[#e5e7eb] rounded-lg px-2.5 py-1 font-mono tracking-wide truncate max-w-[200px] shrink-0">{item.value}</code>
                </div>
              ))}
            </div>
            {isSuperAdmin && (
              <div className="mx-5 mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 flex gap-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-600 shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                </svg>
                <div>
                  <p className="text-xs font-semibold text-amber-800 mb-0.5">How to configure</p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Set in <strong>GCP Console → Cloud Run → Edit &amp; Deploy → Variables</strong>. Get values from <strong>Meta Business Suite → WhatsApp → API Setup</strong>.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
