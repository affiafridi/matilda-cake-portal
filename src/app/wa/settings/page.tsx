"use client";

import { useEffect, useState, useRef } from "react";

type Cred = { label: string; env: string; value: string };

type WaProfile = {
  verified_name:                string;
  display_phone_number:         string;
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

const VERTICALS = [
  "UNDEFINED","OTHER","AUTO","BEAUTY","APPAREL","EDU","ENTERTAIN","EVENT_PLAN",
  "FINANCE","GROCERY","GOVT","HOTEL","HEALTH","NONPROFIT","PROF_SERVICES",
  "RETAIL","TRAVEL","RESTAURANT","NOT_A_BIZ",
];

const TABS = [
  { id: "profile",     label: "Channel Profile", icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z" },
  { id: "template",    label: "Re-engagement",   icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" },
  { id: "credentials", label: "API Credentials", icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" },
] as const;

type Tab = typeof TABS[number]["id"];

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin text-ink-muted" viewBox="0 0 24 24" fill="none">
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
  const [username,       setUsername]       = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameSaved,  setUsernameSaved]  = useState(false);
  const [picUploading,   setPicUploading]   = useState(false);
  const [picError,       setPicError]       = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/wa/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setIsSuperAdmin(j.data.isSuperAdmin);
          setCredentials(j.data.credentials);
        }
      })
      .catch(() => {});

    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((j) => { if (j.ok && j.data.inbox_template_name) setTemplateName(j.data.inbox_template_name); })
      .catch(() => {});

    fetch("/api/wa/profile")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) { setProfile(j.data); setUsername(j.data.username ?? ""); }
        else setProfileError("Could not load profile from Meta.");
      })
      .catch(() => setProfileError("Could not reach Meta API."))
      .finally(() => setProfileLoading(false));
  }, []);

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

  async function saveUsername() {
    if (!username.trim()) return;
    setUsernameSaving(true);
    setUsernameSaved(false);
    try {
      const res = await fetch("/api/wa/profile", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: username.trim() }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      setUsernameSaved(true);
      setTimeout(() => setUsernameSaved(false), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setUsernameSaving(false);
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
      // Refetch profile to get new picture URL
      const pr = await fetch("/api/wa/profile").then((r) => r.json());
      if (pr.ok) { setProfile(pr.data); setUsername(pr.data.username ?? ""); }
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

      <div className="px-6 pt-5 pb-8 lg:px-8 max-w-4xl">

          {/* ── Channel Profile ── */}
          {tab === "profile" && (
            <div className="rounded-2xl border border-rule bg-white overflow-hidden">
              {profileLoading ? (
                <div>
                  {/* Identity skeleton */}
                  <div className="px-5 pt-5 pb-4 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-full bg-rule animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-36 rounded-lg bg-rule animate-pulse" />
                      <div className="h-3 w-28 rounded-lg bg-rule animate-pulse" />
                    </div>
                    <div className="hidden sm:flex items-center gap-2">
                      {[64, 64, 56].map((w, i) => (
                        <div key={i} className="rounded-xl border border-rule px-3 py-1.5 bg-canvas animate-pulse" style={{ width: w }}>
                          <div className="h-2 w-8 rounded bg-rule mb-1.5" />
                          <div className="h-3 w-10 rounded bg-rule" />
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Form skeleton */}
                  <div className="border-t border-rule px-5 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2 h-10 rounded-xl bg-rule animate-pulse" />
                    <div className="h-10 rounded-xl bg-rule animate-pulse" />
                    <div className="h-10 rounded-xl bg-rule animate-pulse" />
                    <div className="sm:col-span-2 h-20 rounded-xl bg-rule animate-pulse" />
                    <div className="h-10 rounded-xl bg-rule animate-pulse" />
                    <div className="h-10 rounded-xl bg-rule animate-pulse" />
                    <div className="sm:col-span-2 h-10 rounded-xl bg-rule animate-pulse" />
                    <div className="sm:col-span-2 h-10 rounded-xl bg-rule animate-pulse" />
                  </div>
                  <div className="px-5 py-4 border-t border-rule flex justify-end">
                    <div className="h-10 w-28 rounded-xl bg-rule animate-pulse" />
                  </div>
                </div>
              ) : profileError ? (
                <div className="px-5 py-5 text-sm text-red-500">{profileError}</div>
              ) : profile && (
                <div>

                  {/* Identity + health strip */}
                  <div className="px-5 pt-5 pb-4 flex items-center gap-4">
                    {/* Clickable avatar */}
                    <label className="relative shrink-0 cursor-pointer group">
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadProfilePicture(f); e.target.value = ""; }} />
                      {picUploading
                        ? <div className="h-14 w-14 rounded-full bg-canvas border border-rule flex items-center justify-center">
                            <svg className="h-5 w-5 animate-spin text-ink-muted" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                          </div>
                        : profile.profile_picture_url
                          ? <img src={profile.profile_picture_url} alt="Profile" className="h-14 w-14 rounded-full object-cover border border-rule" /> /* eslint-disable-line @next/next/no-img-element */
                          : <div className="h-14 w-14 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                              <svg viewBox="0 0 24 24" fill="#25D366" className="h-6 w-6"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>
                            </div>
                      }
                      {!picUploading && (
                        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                          </svg>
                        </div>
                      )}
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-ink">{profile.verified_name || "—"}</p>
                        {profile.is_official_business_account && (
                          <svg viewBox="0 0 24 24" fill="#1877F2" className="h-4 w-4 shrink-0"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                        )}
                      </div>
                      <p className="text-xs text-ink-muted">{profile.display_phone_number || "—"}</p>
                      {profile.username && <p className="text-xs text-brand mt-0.5">@{profile.username}</p>}
                      {picError && <p className="text-xs text-red-500 mt-0.5">{picError}</p>}
                    </div>
                    {/* Health pills inline */}
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      {[
                        { label: "Status",  value: profile.status },
                        { label: "Quality", value: profile.quality_rating },
                        { label: "Limit",   value: profile.messaging_limit_tier },
                      ].map(({ label, value }) => {
                        const raw = value ?? "";
                        const display = raw.replace(/^TIER_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "N/A";
                        const pill = !raw ? "bg-canvas text-ink-muted border-rule"
                          : /GREEN|CONNECTED|UNLIMITED/i.test(raw) ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : /YELLOW|FLAGGED/i.test(raw)            ? "bg-amber-50 text-amber-700 border-amber-200"
                          : /RED|DISCONNECTED/i.test(raw)          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-sky-50 text-sky-700 border-sky-200";
                        return (
                          <div key={label} className={["flex flex-col items-center rounded-xl border px-3 py-1.5 min-w-[64px]", pill].join(" ")}>
                            <span className="text-[9px] font-bold uppercase tracking-wider opacity-60 mb-0.5">{label}</span>
                            <span className="text-xs font-semibold leading-tight">{display}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Form — 2-col grid */}
                  <div className="border-t border-rule px-5 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">

                    {/* Username */}
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Username</label>
                        {profile.username
                          ? <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" /> Active</span>
                          : <span className="text-[11px] text-amber-600 font-medium">Not set</span>}
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-muted">@</span>
                          <input type="text" value={username}
                            onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_.]/gi, "").toLowerCase())}
                            maxLength={25}
                            className="w-full rounded-xl border border-rule bg-canvas pl-8 pr-3.5 py-2.5 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
                            placeholder="matildacake" />
                        </div>
                        <button type="button" onClick={saveUsername} disabled={usernameSaving || !username.trim()}
                          className="shrink-0 flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark transition disabled:opacity-40">
                          {usernameSaving ? <><Spinner /> Saving…</> : usernameSaved ? <><Tick /> Saved</> : profile.username ? "Update" : "Create"}
                        </button>
                      </div>
                    </div>

                    {/* About */}
                    <div>
                      <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5 block">About</label>
                      <input type="text" value={profile.about}
                        onChange={(e) => setProfile((p) => p ? { ...p, about: e.target.value } : p)}
                        maxLength={139}
                        className="w-full rounded-xl border border-rule bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
                        placeholder="Available" />
                    </div>

                    {/* Category */}
                    <div>
                      <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5 block">Category</label>
                      <select value={profile.vertical}
                        onChange={(e) => setProfile((p) => p ? { ...p, vertical: e.target.value } : p)}
                        className="w-full rounded-xl border border-rule bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20">
                        {VERTICALS.map((v) => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
                      </select>
                    </div>

                    {/* Description — full width */}
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5 block">Description</label>
                      <textarea value={profile.description}
                        onChange={(e) => setProfile((p) => p ? { ...p, description: e.target.value } : p)}
                        rows={3} maxLength={512}
                        className="w-full rounded-xl border border-rule bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20 resize-none"
                        placeholder="Tell customers about your business…" />
                      <p className="mt-1 text-right text-[11px] text-ink-muted">{profile.description.length}/512</p>
                    </div>

                    {/* Email */}
                    <div>
                      <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5 block">Email</label>
                      <input type="email" value={profile.email}
                        onChange={(e) => setProfile((p) => p ? { ...p, email: e.target.value } : p)}
                        maxLength={128}
                        className="w-full rounded-xl border border-rule bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
                        placeholder="hello@business.com" />
                    </div>

                    {/* Website 1 */}
                    <div>
                      <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5 block">Website</label>
                      <input type="url" value={profile.websites[0] ?? ""}
                        onChange={(e) => { const next = [...(profile.websites ?? [])]; next[0] = e.target.value; setProfile((p) => p ? { ...p, websites: next } : p); }}
                        className="w-full rounded-xl border border-rule bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
                        placeholder="https://yoursite.com" />
                    </div>

                    {/* Address — full width */}
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5 block">Address</label>
                      <input type="text" value={profile.address}
                        onChange={(e) => setProfile((p) => p ? { ...p, address: e.target.value } : p)}
                        maxLength={256}
                        className="w-full rounded-xl border border-rule bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
                        placeholder="123 Main St, City, Country" />
                    </div>

                    {/* Website 2 */}
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5 block">Second Website <span className="normal-case font-normal">(optional)</span></label>
                      <input type="url" value={profile.websites[1] ?? ""}
                        onChange={(e) => { const next = [...(profile.websites ?? [])]; next[1] = e.target.value; setProfile((p) => p ? { ...p, websites: next } : p); }}
                        className="w-full rounded-xl border border-rule bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20"
                        placeholder="https://second-site.com" />
                    </div>

                  </div>

                  {/* Save bar */}
                  <div className="px-5 py-4 flex items-center justify-between border-t border-rule bg-canvas/40">
                    {profileSaved
                      ? <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium"><Tick /> Saved</span>
                      : <span className="text-xs text-ink-muted">Fields are saved together — click Save when done.</span>}
                    <button type="button" onClick={saveProfile} disabled={profileSaving}
                      className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark transition disabled:opacity-50">
                      {profileSaving && <Spinner />}
                      {profileSaving ? "Saving…" : "Save Profile"}
                    </button>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* ── Official Business Account ── */}
          {tab === "profile" && profile && (
            <div className="mt-4 rounded-2xl border border-rule bg-white overflow-hidden">
              <div className="flex items-start gap-4 px-5 py-5">
                <div className={[
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  profile.is_official_business_account ? "bg-blue-50" : "bg-canvas",
                ].join(" ")}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill={profile.is_official_business_account ? "#1877F2" : "currentColor"}>
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-ink">Official Business Account</p>
                    {profile.is_official_business_account
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Verified
                        </span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-canvas border border-rule px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                          Not verified
                        </span>
                    }
                  </div>
                  <p className="text-xs text-ink-muted">
                    {profile.is_official_business_account
                      ? "Your account has a blue checkmark confirming it as an authentic and notable brand."
                      : "Get a blue checkmark to show customers your account is authentic. Requires Meta review."}
                  </p>
                </div>
                {!profile.is_official_business_account && (
                  <a href="https://business.facebook.com/wa/manage/phone-numbers/" target="_blank" rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1.5 rounded-xl border border-rule bg-canvas px-4 py-2 text-sm font-medium text-ink hover:bg-rule/40 transition">
                    Submit request
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                    </svg>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ── Re-engagement Template ── */}
          {tab === "template" && (
            <div className="rounded-2xl border border-rule bg-white overflow-hidden">
              {/* Header */}
              <div className="flex items-start gap-4 px-5 py-5 border-b border-rule bg-canvas/40">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-brand">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Re-engagement Template</p>
                  <p className="text-xs text-ink-muted mt-0.5">Sent automatically when the 24-hour messaging window closes. Must be an approved template in Meta Business Suite.</p>
                </div>
              </div>
              {/* Input */}
              <div className="px-5 py-5">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">Template Name</p>
                <div className="flex items-center gap-3">
                  <input type="text" value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="conversation_followup"
                    className="flex-1 rounded-xl border border-rule bg-canvas px-3.5 py-2.5 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-brand/30" />
                  <button type="button" onClick={saveTemplate} disabled={templateSaving}
                    className="shrink-0 flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark transition disabled:opacity-50">
                    {templateSaving && <Spinner />}
                    {templateSaved ? "Saved ✓" : templateSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── API Credentials ── */}
          {tab === "credentials" && (
            <div className="rounded-2xl border border-rule bg-white overflow-hidden">
              {/* Header */}
              <div className="flex items-start gap-4 px-5 py-5 border-b border-rule bg-canvas/40">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-brand">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">API Credentials</p>
                  <p className="text-xs text-ink-muted mt-0.5">Your WhatsApp Business API identifiers pulled from environment variables. Read-only — set in Cloud Run.</p>
                </div>
              </div>
              {/* Credentials list */}
              <div className="px-5 py-4 space-y-2">
                {credentials.map((item) => (
                  <div key={item.env} className="flex items-center justify-between rounded-xl bg-canvas border border-rule px-4 py-3 gap-4 overflow-hidden">
                    <div>
                      <p className="text-xs font-semibold text-ink">{item.label}</p>
                      <p className="text-[11px] text-ink-muted font-mono mt-0.5">{item.env}</p>
                    </div>
                    <code className="text-xs text-ink-muted bg-white border border-rule rounded-lg px-2.5 py-1 font-mono tracking-wide truncate max-w-[200px] shrink-0">{item.value}</code>
                  </div>
                ))}
              </div>
              {/* How to configure */}
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
