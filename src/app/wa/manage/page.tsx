"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

type TemplateComponent = {
  type: string; text?: string; format?: string;
  example?: { header_url?: string[]; header_handle?: string[]; body_text?: string[][] };
  buttons?: {
    type: string; text: string;
    url?: string; phone_number?: string; example?: string[];
  }[];
};
type Template = {
  id: string; name: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | string;
  language: string; category: string;
  components: TemplateComponent[];
};
type HeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";

type TemplateDraft = {
  id: number; name: string; category: string; language: string;
  header_type: HeaderType; header_text: string | null;
  header_media: { handle?: string; url?: string } | null;
  body: string; footer_text: string | null;
  buttons: ButtonDef[]; examples: string[];
  created_by: string | null; created_at: string; updated_at: string;
};

// ── Status config ──────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; dot: string; badge: string }> = {
  APPROVED: { label: "Approved",  dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  PENDING:  { label: "In review", dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700 border-amber-200" },
  REJECTED: { label: "Rejected",  dot: "bg-red-400",     badge: "bg-red-50 text-red-700 border-red-200" },
  PAUSED:   { label: "Paused",    dot: "bg-gray-400",    badge: "bg-gray-50 text-gray-600 border-gray-200" },
  DRAFT:    { label: "Draft",     dot: "bg-slate-400",   badge: "bg-slate-50 text-slate-600 border-slate-200" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS["PAUSED"];
  return (
    <span className={["inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold", s.badge].join(" ")}>
      <span className={["h-1.5 w-1.5 rounded-full shrink-0", s.dot].join(" ")} />
      {s.label}
    </span>
  );
}

// ── WhatsApp bubble preview ────────────────────────────────────────────────

function useWaProfile() {
  const [profile, setProfile] = useState<{ name: string; picture: string | null }>({ name: "Business account", picture: null });
  useEffect(() => {
    fetch("/api/wa/profile").then(r => r.json()).then(j => {
      if (j.ok && j.data) setProfile({
        name:    j.data.verified_name      || "Business account",
        picture: j.data.profile_picture_url ?? null,
      });
    }).catch(() => {});
  }, []);
  return profile;
}

function WaBubble({ headerType, headerText, headerMediaUrl, locationName, body, footer, buttons = [] }: {
  headerType: HeaderType; headerText?: string; headerMediaUrl?: string;
  locationName?: string; body: string; footer?: string; buttons?: { text: string }[];
}) {
  const [time, setTime] = useState("12:00 AM");
  useEffect(() => { setTime(new Date().toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" })); }, []);
  const profile = useWaProfile();
  return (
    <div className="inline-block w-full">
      <div className="overflow-hidden rounded-xl rounded-tl-sm bg-white border border-rule">
        {/* Header area */}
        {headerType === "IMAGE" && (
          headerMediaUrl
            ? <img src={headerMediaUrl} alt="header" className="w-full object-cover max-h-36" /> // eslint-disable-line @next/next/no-img-element
            : <div className="flex h-28 flex-col items-center justify-center gap-1.5 bg-gray-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                <p className="text-[10px] text-gray-400">Image preview</p>
              </div>
        )}
        {headerType === "VIDEO" && (
          headerMediaUrl
            ? (
              <div className="relative bg-gray-900">
                <video src={headerMediaUrl} className="w-full max-h-36 object-cover" preload="metadata" muted playsInline />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
                    <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5 translate-x-0.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
                </div>
              </div>
            )
            : <div className="flex h-28 flex-col items-center justify-center gap-1.5 bg-gray-900">
                <svg viewBox="0 0 24 24" fill="white" className="h-8 w-8 opacity-60"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                <p className="text-[10px] text-gray-400">Video preview</p>
              </div>
        )}
        {headerType === "DOCUMENT" && (
          <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-800">document.pdf</p>
              <p className="text-[10px] text-gray-400">PDF • Tap to open</p>
            </div>
          </div>
        )}
        {headerType === "LOCATION" && (
          <div className="border-b border-gray-100 bg-gray-50">
            <div className="flex h-24 items-center justify-center bg-[#e8f4ea]">
              <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10"><circle cx="12" cy="10" r="3" fill="#128C7E" /><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#25D366" opacity=".4" /><circle cx="12" cy="10" r="3" fill="#128C7E" /></svg>
            </div>
            {locationName && <p className="px-3 py-1.5 text-xs font-semibold text-gray-800">{locationName}</p>}
          </div>
        )}
        {headerType === "TEXT" && headerText && (
          <div className="bg-[#128C7E] px-3 py-2">
            <p className="text-xs font-semibold text-white">{headerText}</p>
          </div>
        )}

        {/* Body */}
        <div className="px-3 py-2.5">
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-gray-800">
            {body || <span className="italic text-gray-400">Your message will appear here…</span>}
          </p>
          {footer && <p className="mt-2 text-[10px] text-gray-400">{footer}</p>}
          <p className="mt-1 text-right text-[9px] text-gray-400">{time} ✓✓</p>
        </div>

        {/* Buttons */}
        {buttons.length > 0 && (
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {buttons.map((b, i) => (
              <p key={i} className="py-2 text-center text-[12px] font-semibold text-[#128C7E]">{b.text}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Header type selector ───────────────────────────────────────────────────

const HEADER_OPTIONS: { type: HeaderType; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    type: "NONE",
    label: "None",
    desc: "No header",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M18 6L6 18M6 6l12 12" /></svg>,
  },
  {
    type: "TEXT",
    label: "Text",
    desc: "Headline text",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M4 7V4h16v3M9 20h6M12 4v16" /></svg>,
  },
  {
    type: "IMAGE",
    label: "Image",
    desc: "JPG / PNG",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>,
  },
  {
    type: "VIDEO",
    label: "Video",
    desc: "MP4",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>,
  },
  {
    type: "DOCUMENT",
    label: "Document",
    desc: "PDF",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8" /></svg>,
  },
  {
    type: "LOCATION",
    label: "Location",
    desc: "Map pin",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>,
  },
];

const SUPER_ADMIN_ONLY_HEADERS = new Set(["VIDEO", "DOCUMENT", "LOCATION"]);

function HeaderTypeSelector({ value, onChange, isSuperAdmin }: { value: HeaderType; onChange: (v: HeaderType) => void; isSuperAdmin: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {HEADER_OPTIONS.map((opt) => {
        const locked = !isSuperAdmin && SUPER_ADMIN_ONLY_HEADERS.has(opt.type);
        const active = value === opt.type;
        return (
          <button key={opt.type} type="button"
            onClick={() => { if (!locked) onChange(opt.type); }}
            title={locked ? "Super Admin only" : undefined}
            className={["flex flex-col items-center gap-1.5 rounded-xl border py-3 px-2 text-center transition-all duration-100",
              locked ? "border-rule bg-canvas text-ink-muted opacity-35 cursor-not-allowed" :
              active ? "border-[#25D366] bg-[#25D366]/8 text-[#075E54]" :
              "border-rule bg-canvas text-ink-muted hover:border-[#25D366]/40 hover:text-ink"].join(" ")}>
            <span className={active ? "text-[#128C7E]" : ""}>{opt.icon}</span>
            <span className="text-[11px] font-semibold leading-none">{opt.label}</span>
            <span className="text-[9px] leading-none opacity-60">{opt.desc}</span>
            {active && <span className="h-1 w-1 rounded-full bg-[#25D366]" />}
          </button>
        );
      })}
    </div>
  );
}

// ── Category selector ──────────────────────────────────────────────────────

const CATEGORIES = [
  {
    value: "MARKETING",
    label: "Marketing",
    desc: "Promotions & offers",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
    color: "border-purple-200 bg-purple-50 text-purple-700",
    activeColor: "border-purple-400 bg-purple-50 text-purple-800 ring-1 ring-purple-300",
  },
  {
    value: "UTILITY",
    label: "Utility",
    desc: "Order updates & alerts",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>,
    color: "border-blue-200 bg-blue-50 text-blue-700",
    activeColor: "border-blue-400 bg-blue-50 text-blue-800 ring-1 ring-blue-300",
  },
  {
    value: "AUTHENTICATION",
    label: "Authentication",
    desc: "OTPs & verification",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>,
    color: "border-orange-200 bg-orange-50 text-orange-700",
    activeColor: "border-orange-400 bg-orange-50 text-orange-800 ring-1 ring-orange-300",
  },
];

function CategorySelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {CATEGORIES.map((cat) => {
        const active = value === cat.value;
        return (
          <button key={cat.value} type="button" onClick={() => onChange(cat.value)}
            className={["flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-100", active ? cat.activeColor : "border-rule bg-white text-ink-muted hover:border-gray-300 hover:text-ink"].join(" ")}>
            <span className={["flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", active ? "bg-white/70" : "bg-gray-100"].join(" ")}>
              {cat.icon}
            </span>
            <div>
              <p className="text-sm font-semibold leading-none">{cat.label}</p>
              <p className="mt-1 text-[11px] leading-none opacity-70">{cat.desc}</p>
            </div>
            {active && (
              <svg viewBox="0 0 24 24" fill="currentColor" className="ml-auto h-4 w-4 shrink-0 opacity-70"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── File/URL media input ───────────────────────────────────────────────────

type MediaValue = { handle?: string; url?: string; previewUrl?: string; mimeType?: string };

function MediaInput({ label, accept, value, onChange, hint }: {
  label: string; accept: string;
  value: MediaValue;
  onChange: (v: MediaValue) => void;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/bot/media/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Upload failed");
      onChange({
        handle: json.data.handle as string,
        previewUrl: `/api/bot/media/preview?handle=${encodeURIComponent(json.data.handle as string)}`,
        mimeType: file.type,
        url: undefined,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  }

  const previewSrc = value.previewUrl ?? value.url;
  const hasFile  = !!(value.handle || previewSrc);
  const isVideo  = value.mimeType?.startsWith("video/") || value.url?.toLowerCase().endsWith(".mp4");
  const isPdf    = value.mimeType === "application/pdf" || value.url?.toLowerCase().endsWith(".pdf");

  return (
    <div className="space-y-3">
      {/* Preview — shown once file is uploaded or URL pasted */}
      {hasFile && (
        <div className="overflow-hidden rounded-xl border border-rule">
          {isPdf ? (
            /* PDF — show a card, don't try to render the binary */
            <div className="flex items-center justify-between gap-3 bg-gray-50 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">PDF uploaded</p>
                  <p className="text-xs text-ink-muted">{value.handle ? "Stored on Meta — ready to use" : "URL set"}</p>
                </div>
              </div>
              <button type="button" onClick={() => { onChange({}); if (fileRef.current) fileRef.current.value = ""; }}
                className="shrink-0 rounded-lg border border-rule bg-white px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-red-50 hover:text-red-500 transition">
                Remove
              </button>
            </div>
          ) : isVideo && previewSrc ? (
            /* Video — render player */
            <div className="relative bg-black">
              <video src={previewSrc} className="w-full max-h-48 object-contain" controls muted playsInline />
              <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
                {value.handle && (
                  <span className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-2.5 py-1 text-[11px] font-semibold text-white shadow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M20 6L9 17l-5-5"/></svg>
                    Stored on Meta
                  </span>
                )}
                <button type="button" onClick={() => { onChange({}); if (fileRef.current) fileRef.current.value = ""; }}
                  className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-black/80">
                  Remove
                </button>
              </div>
            </div>
          ) : isVideo ? (
            /* Video uploaded but no previewable URL yet */
            <div className="flex items-center justify-between gap-3 bg-gray-900 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5 opacity-80"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Video uploaded</p>
                  <p className="text-xs text-white/60">{value.handle ? "Stored on Meta — ready to use" : "URL set"}</p>
                </div>
              </div>
              <button type="button" onClick={() => { onChange({}); if (fileRef.current) fileRef.current.value = ""; }}
                className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition">
                Remove
              </button>
            </div>
          ) : previewSrc ? (
            /* Image */
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewSrc} alt="header preview" className="w-full max-h-48 object-cover" />
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/40 to-transparent p-3">
                <div className="flex items-center gap-2">
                  {value.handle && (
                    <span className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-2.5 py-1 text-[11px] font-semibold text-white">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M20 6L9 17l-5-5"/></svg>
                      Stored on Meta
                    </span>
                  )}
                  <button type="button" onClick={() => { onChange({}); if (fileRef.current) fileRef.current.value = ""; }}
                    className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-black/70">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Drop zone — hidden once file uploaded */}
      {!hasFile && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
          className={["flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed py-8 transition-colors", dragOver ? "border-[#25D366] bg-[#25D366]/5" : "border-rule bg-canvas hover:border-[#25D366]/50 hover:bg-[#25D366]/3"].join(" ")}>
          <input ref={fileRef} type="file" accept={accept} className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <svg className="h-7 w-7 animate-spin text-[#25D366]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
              <p className="text-sm font-medium text-[#25D366]">Uploading to Meta…</p>
            </div>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25D366]/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-ink">Drag & drop or click to upload</p>
                <p className="mt-0.5 text-xs text-ink-muted">{label} — stored directly on Meta</p>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </p>
      )}

      {/* URL fallback */}
      {!value.handle && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-rule" />
            <span className="text-[11px] font-medium text-ink-muted">or paste a public URL</span>
            <div className="h-px flex-1 bg-rule" />
          </div>
          <input type="url" value={value.url ?? ""} onChange={(e) => onChange({ url: e.target.value })}
            placeholder="https://example.com/file"
            className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20" />
        </>
      )}

      {hint && <p className="text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}

// ── Button types ───────────────────────────────────────────────────────────

type ButtonDef =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string; urlType: "STATIC" | "DYNAMIC"; urlExample: string }
  | { type: "PHONE_NUMBER"; text: string; phone: string }
  | { type: "COPY_CODE"; text: string; example: string }
  | { type: "VOICE_CALL"; text: string };

const BTN_TYPES: { type: ButtonDef["type"]; label: string; desc: string; icon: React.ReactNode; max?: number }[] = [
  {
    type: "QUICK_REPLY", label: "Quick reply", desc: "Customer taps to send a reply",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  },
  {
    type: "URL", label: "Visit website", desc: "Opens a URL in the browser",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>,
  },
  {
    type: "PHONE_NUMBER", label: "Call phone number", desc: "Dials a phone number",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.9 2.18 2 2 0 012.88.01h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
  },
  {
    type: "COPY_CODE", label: "Copy offer code", desc: "Copies a coupon code", max: 1,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  },
  {
    type: "VOICE_CALL", label: "Call on WhatsApp", desc: "Starts a WhatsApp voice call",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12 12 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/><path d="M20 10.999h2a10 10 0 00-10-10v2a8 8 0 018 8z"/><path d="M4 1v2a16 16 0 0016 16h2" opacity=".4"/></svg>,
  },
];

function defaultBtn(type: ButtonDef["type"]): ButtonDef {
  switch (type) {
    case "QUICK_REPLY":   return { type, text: "" };
    case "URL":           return { type, text: "Visit website", url: "", urlType: "STATIC", urlExample: "" };
    case "PHONE_NUMBER":  return { type, text: "Call us", phone: "" };
    case "COPY_CODE":     return { type, text: "Copy offer code", example: "" };
    case "VOICE_CALL":    return { type, text: "Call on WhatsApp" };
  }
}

function ButtonEditor({ btn, index, onChange, onRemove }: {
  btn: ButtonDef; index: number; onChange: (b: ButtonDef) => void; onRemove: () => void;
}) {
  const inputCls = "w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20";
  const meta = BTN_TYPES.find((b) => b.type === btn.type)!;

  return (
    <div className="rounded-xl border border-rule bg-white">
      <div className="flex items-center justify-between border-b border-rule px-3 py-2.5">
        <div className="flex items-center gap-2 text-ink">
          <span className="text-ink-muted">{meta.icon}</span>
          <span className="text-xs font-semibold">{meta.label}</span>
          <span className="text-[10px] text-ink-muted">#{index + 1}</span>
        </div>
        <button type="button" onClick={onRemove}
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-muted hover:bg-red-50 hover:text-red-500 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Button text</label>
          <input type="text" maxLength={25} value={btn.text}
            onChange={(e) => onChange({ ...btn, text: e.target.value } as ButtonDef)}
            placeholder="e.g. Shop now" className={inputCls} />
        </div>

        {btn.type === "URL" && (
          <>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink-muted uppercase tracking-wide">URL type</label>
              <div className="flex gap-2">
                {(["STATIC", "DYNAMIC"] as const).map((t) => (
                  <button key={t} type="button"
                    onClick={() => onChange({ ...btn, urlType: t })}
                    className={["flex-1 rounded-lg border py-1.5 text-xs font-semibold transition", btn.urlType === t ? "border-[#25D366] bg-[#25D366]/8 text-[#075E54]" : "border-rule text-ink-muted hover:border-[#25D366]/40"].join(" ")}>
                    {t === "STATIC" ? "Static" : "Dynamic"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-ink-muted">{btn.urlType === "DYNAMIC" ? "URL ends with a variable you set per send (e.g. a tracking link)." : "Same URL for everyone."}</p>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Website URL</label>
              <input type="url" value={btn.url}
                onChange={(e) => onChange({ ...btn, url: e.target.value })}
                placeholder={btn.urlType === "DYNAMIC" ? "https://example.com/order/{{1}}" : "https://example.com"}
                className={inputCls} />
            </div>
            {btn.urlType === "DYNAMIC" && (
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Example URL suffix</label>
                <input type="text" value={btn.urlExample}
                  onChange={(e) => onChange({ ...btn, urlExample: e.target.value })}
                  placeholder="e.g. summer-sale" className={inputCls} />
                <p className="mt-1 text-[11px] text-ink-muted">Required by Meta for template review.</p>
              </div>
            )}
          </>
        )}

        {btn.type === "PHONE_NUMBER" && (
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Phone number</label>
            <input type="tel" value={btn.phone}
              onChange={(e) => onChange({ ...btn, phone: e.target.value })}
              placeholder="+971500000000" className={inputCls} />
          </div>
        )}

        {btn.type === "COPY_CODE" && (
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Offer code (example)</label>
            <input type="text" maxLength={15} value={btn.example}
              onChange={(e) => onChange({ ...btn, example: e.target.value })}
              placeholder="e.g. GET20MTC" className={inputCls} />
            <p className="mt-1 text-[11px] text-ink-muted">This is the example code shown to Meta for review. You can send a different code per campaign.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create form ────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: "en", label: "English" }, { code: "en_US", label: "English (US)" },
  { code: "ar", label: "Arabic" }, { code: "ur", label: "Urdu" },
  { code: "hi", label: "Hindi" }, { code: "fr", label: "French" },
];

function apiButtonToButtonDef(btn: NonNullable<TemplateComponent["buttons"]>[0]): ButtonDef {
  switch (btn.type) {
    case "QUICK_REPLY":   return { type: "QUICK_REPLY", text: btn.text };
    case "URL":           return { type: "URL", text: btn.text, url: btn.url ?? "", urlType: btn.url?.includes("{{1}}") ? "DYNAMIC" : "STATIC", urlExample: btn.example?.[0] ?? "" };
    case "PHONE_NUMBER":  return { type: "PHONE_NUMBER", text: btn.text, phone: btn.phone_number ?? "" };
    case "COPY_CODE":     return { type: "COPY_CODE", text: btn.text, example: btn.example?.[0] ?? "" };
    case "VOICE_CALL":    return { type: "VOICE_CALL", text: btn.text };
    default:              return { type: "QUICK_REPLY", text: btn.text };
  }
}

function CreateForm({ onCreated, onCancel, initialTemplate, isSuperAdmin, isDuplicate, initialDraft, onDraftSaved }: {
  onCreated: () => void; onCancel: () => void; initialTemplate?: Template; isSuperAdmin: boolean;
  isDuplicate?: boolean; initialDraft?: TemplateDraft; onDraftSaved?: () => void;
}) {
  const isEdit = !!initialTemplate && !isDuplicate;
  const profile = useWaProfile();
  const [name, setName] = useState(() => {
    if (initialDraft) return initialDraft.name;
    if (isDuplicate) return "";
    return initialTemplate?.name ?? "";
  });
  const [category, setCategory] = useState(initialDraft?.category ?? initialTemplate?.category ?? "MARKETING");
  const [language, setLanguage] = useState(initialDraft?.language ?? initialTemplate?.language ?? "en");
  const [headerType, setHeaderType] = useState<HeaderType>(() => {
    if (initialDraft) return initialDraft.header_type;
    const h = initialTemplate?.components.find((c) => c.type === "HEADER");
    return (h?.format as HeaderType) ?? "NONE";
  });
  const [headerText, setHeaderText] = useState(() => {
    if (initialDraft) return initialDraft.header_text ?? "";
    const h = initialTemplate?.components.find((c) => c.type === "HEADER");
    return h?.format === "TEXT" ? (h.text ?? "") : "";
  });
  // Store media per header type so switching types doesn't lose uploads
  const [headerMediaMap, setHeaderMediaMap] = useState<Record<string, MediaValue>>(() => {
    const initial: MediaValue = (() => {
      if (initialDraft) return initialDraft.header_media ?? {};
      const h = initialTemplate?.components.find((c) => c.type === "HEADER");
      if (!h || h.format === "TEXT" || h.format === "LOCATION" || h.format === "NONE") return {};
      const url = h.example?.header_url?.[0];
      const handle = h.example?.header_handle?.[0];
      if (url) return { url };
      if (handle) return { previewUrl: `/api/bot/media/preview?handle=${encodeURIComponent(handle)}`, handle: handle.startsWith("h:") || /^\d:/.test(handle) ? handle : undefined };
      return {};
    })();
    const initialType = (() => {
      if (initialDraft) return initialDraft.header_type;
      const h = initialTemplate?.components.find((c) => c.type === "HEADER");
      return (h?.format as HeaderType) ?? "NONE";
    })();
    return { [initialType]: initial };
  });
  const headerMedia = headerMediaMap[headerType] ?? {};
  function setHeaderMedia(v: MediaValue) {
    setHeaderMediaMap((prev) => ({ ...prev, [headerType]: v }));
  }
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationLat, setLocationLat] = useState("");
  const [locationLng, setLocationLng] = useState("");
  const [body, setBody] = useState(() => {
    if (initialDraft) return initialDraft.body;
    return initialTemplate?.components.find((c) => c.type === "BODY")?.text ?? "";
  });
  const [footerText, setFooterText] = useState(() => {
    if (initialDraft) return initialDraft.footer_text ?? "";
    return initialTemplate?.components.find((c) => c.type === "FOOTER")?.text ?? "";
  });
  const [examples, setExamples] = useState<string[]>(() => {
    if (initialDraft) return initialDraft.examples ?? [];
    const b = initialTemplate?.components.find((c) => c.type === "BODY");
    return b?.example?.body_text?.[0] ?? [];
  });
  const [buttons, setButtons] = useState<ButtonDef[]>(() => {
    if (initialDraft) return initialDraft.buttons ?? [];
    const btns = initialTemplate?.components.find((c) => c.type === "BUTTONS")?.buttons ?? [];
    return btns.map(apiButtonToButtonDef);
  });
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved]   = useState(false);
  const [showBtnMenu, setShowBtnMenu] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const varMatches = body.match(/\{\{(\d+)\}\}/g) ?? [];
  const varIndices = Array.from(new Set(varMatches.map((m) => parseInt(m.replace(/\{|\}/g, ""), 10)))).sort((a, b) => a - b);

  function insertVar() {
    const next = varIndices.length > 0 ? Math.max(...varIndices) + 1 : 1;
    setBody((prev) => prev + `{{${next}}}`);
  }

  useEffect(() => {
    setExamples(varIndices.map((_, i) => examples[i] ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varIndices.length]);

  const btnMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showBtnMenu) return;
    function handler(e: MouseEvent) {
      if (btnMenuRef.current && !btnMenuRef.current.contains(e.target as Node)) {
        setShowBtnMenu(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showBtnMenu]);

  async function saveDraft() {
    setSavingDraft(true); setError(null);
    try {
      const payload = { name, category, language, headerType, headerText, headerMedia, locationName, locationAddress, locationLat, locationLng, body, footerText, buttons, examples };
      const method  = initialDraft ? "PUT" : "POST";
      const body2   = initialDraft ? JSON.stringify({ ...payload, id: initialDraft.id }) : JSON.stringify(payload);
      const res = await fetch("/api/bot/template-drafts", { method, headers: { "Content-Type": "application/json" }, body: body2 });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to save draft");
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);
      onDraftSaved?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save draft");
    } finally { setSavingDraft(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const payload: Record<string, unknown> = { name, category, language, body, bodyExamples: examples, footerText, buttons };
      if (headerType === "TEXT" && headerText.trim()) payload.headerText = headerText.trim();
      if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType)) {
        payload.headerFormat = headerType;
        if (headerMedia.handle) payload.headerHandle = headerMedia.handle;
        else if (headerMedia.url?.trim()) payload.headerImageUrl = headerMedia.url.trim();
      }
      if (headerType === "LOCATION") payload.headerLocation = { name: locationName, address: locationAddress, latitude: parseFloat(locationLat) || 0, longitude: parseFloat(locationLng) || 0 };

      const method = isEdit ? "PATCH" : "POST";
      if (isEdit) payload.templateId = initialTemplate!.id;

      const res = await fetch("/api/bot/templates/manage", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed");
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-6 py-3 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-lg border border-rule text-ink-muted hover:bg-cream/60 transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <div className="h-5 w-px bg-rule" />
            <h1 className="text-sm font-semibold text-ink">
              {isEdit ? `Edit — ${initialTemplate!.name}` : isDuplicate ? `Duplicate — ${initialTemplate!.name}` : initialDraft ? `Draft — ${initialDraft.name || "Untitled"}` : "New template"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg border border-rule px-4 py-1.5 text-sm font-medium text-ink hover:bg-cream/50 transition">Cancel</button>
            {/* Save as Draft — not shown when editing a live WA template */}
            {!isEdit && (
              <button type="button" onClick={saveDraft} disabled={savingDraft}
                className="flex items-center gap-2 rounded-lg border border-rule bg-white px-4 py-1.5 text-sm font-semibold text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-60 transition">
                {savingDraft
                  ? <><svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg> Saving…</>
                  : draftSaved
                  ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-emerald-500"><path d="M20 6L9 17l-5-5"/></svg> <span className="text-emerald-600">Saved!</span></>
                  : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg> Save as draft</>}
              </button>
            )}
            <button form="create-form" type="submit" disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#128C7E] disabled:opacity-60 transition">
              {submitting
                ? <><svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg> Saving…</>
                : isEdit ? "Save changes →" : "Submit for review →"}
            </button>
          </div>
        </div>
      </div>

      <form id="create-form" onSubmit={handleSubmit}>
        <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-rule">

          {/* ── Left: form ── */}
          <div className="flex-1 min-w-0 space-y-4 px-6 py-5 lg:px-8">

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>{error}</span>
              </div>
            )}

            {/* ── Section 1: Name / Language / Category ── */}
            <div className="rounded-xl border border-rule bg-[#f6f8fa]">
              <div className="border-b border-rule px-4 py-3">
                <p className="text-sm font-semibold text-ink">Template details</p>
              </div>
              <div className="space-y-4 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink">Template name <span className="text-danger">*</span></label>
                    <input required type="text" value={name} disabled={isEdit}
                      onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                      placeholder="order_confirmation"
                      className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20 disabled:opacity-50 disabled:cursor-not-allowed" />
                    <p className="mt-1 text-[11px] text-ink-muted">{isEdit ? "Template name cannot be changed after creation." : "Lowercase, numbers, underscores only. Cannot change later."}</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink">Language</label>
                    <select value={language} disabled={isEdit} onChange={(e) => setLanguage(e.target.value)}
                      className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20 disabled:opacity-50 disabled:cursor-not-allowed">
                      {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold text-ink">Category</label>
                  <CategorySelector value={category} onChange={setCategory} />
                </div>
              </div>
            </div>

            {/* ── Section 2: Header ── */}
            <div className="rounded-xl border border-rule bg-[#f6f8fa]">
              <div className="border-b border-rule px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">Header</p>
                  <span className="text-xs text-ink-muted">Optional</span>
                </div>
              </div>
              <div className="space-y-4 p-4">
                <HeaderTypeSelector value={headerType} onChange={setHeaderType} isSuperAdmin={isSuperAdmin} />

                {headerType === "TEXT" && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink">Header text</label>
                    <input type="text" value={headerText} onChange={(e) => setHeaderText(e.target.value)} maxLength={60}
                      placeholder="e.g. Your order is confirmed!"
                      className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20" />
                    <p className="mt-1 flex justify-between text-[11px] text-ink-muted"><span>Shown as a headline at the top of your message.</span><span>{headerText.length}/60</span></p>
                  </div>
                )}
                {headerType === "IMAGE" && (
                  <MediaInput label="JPG, PNG — max 5 MB" accept=".jpg,.jpeg,.png,image/*" value={headerMedia} onChange={setHeaderMedia} hint="Image will appear at the top of the message on the recipient's phone." />
                )}
                {headerType === "VIDEO" && (
                  <MediaInput label="MP4 — max 16 MB" accept=".mp4,video/mp4" value={headerMedia} onChange={setHeaderMedia} hint="Short video clip shown at the top of the message." />
                )}
                {headerType === "DOCUMENT" && (
                  <MediaInput label="PDF — max 100 MB" accept=".pdf,application/pdf" value={headerMedia} onChange={setHeaderMedia} hint="PDF document the recipient can open directly from WhatsApp." />
                )}
                {headerType === "LOCATION" && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-ink">Place name</label>
                        <input type="text" value={locationName} onChange={(e) => setLocationName(e.target.value)}
                          placeholder="Branch name"
                          className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-ink">Address</label>
                        <input type="text" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)}
                          placeholder="Sheikh Zayed Rd, Dubai"
                          className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20" />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-ink">Latitude</label>
                        <input type="number" step="any" value={locationLat} onChange={(e) => setLocationLat(e.target.value)}
                          placeholder="25.2048"
                          className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-ink">Longitude</label>
                        <input type="number" step="any" value={locationLng} onChange={(e) => setLocationLng(e.target.value)}
                          placeholder="55.2708"
                          className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Section 3: Body ── */}
            <div className="rounded-xl border border-rule bg-[#f6f8fa]">
              <div className="border-b border-rule px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">Message body <span className="text-danger">*</span></p>
                  <button type="button" onClick={insertVar}
                    className="flex items-center gap-1.5 rounded-lg border border-[#25D366]/40 bg-[#25D366]/5 px-2.5 py-1 text-[11px] font-semibold text-[#075E54] hover:bg-[#25D366]/10 transition">
                    + Add variable
                  </button>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <textarea required rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1024}
                  placeholder={"Hello {{1}}, your order is ready for pickup!"}
                  className="w-full resize-none rounded-lg border border-rule bg-canvas px-3 py-2.5 text-sm leading-relaxed focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20" />
                <p className="text-right text-[11px] text-ink-muted">{body.length}/1024</p>

                {varIndices.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50">
                    <div className="border-b border-amber-200 px-4 py-2.5">
                      <p className="text-xs font-semibold text-amber-800">Example values <span className="font-normal opacity-70">— required by Meta for template review</span></p>
                    </div>
                    <div className="space-y-2.5 p-4">
                      {varIndices.map((n, i) => (
                        <div key={n} className="flex items-center gap-3">
                          <code className="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800">{`{{${n}}}`}</code>
                          <input type="text" required placeholder={n === 1 ? "e.g. Ahmed" : n === 2 ? "e.g. ORD-1234" : "example value"}
                            value={examples[i] ?? ""}
                            onChange={(e) => setExamples((prev) => { const u = [...prev]; u[i] = e.target.value; return u; })}
                            className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Section 4: Footer ── */}
            <div className="rounded-xl border border-rule bg-[#f6f8fa]">
              <div className="border-b border-rule px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">Footer</p>
                  <span className="text-xs text-ink-muted">Optional</span>
                </div>
              </div>
              <div className="p-4">
                <input type="text" value={footerText} onChange={(e) => setFooterText(e.target.value)} maxLength={60}
                  placeholder="e.g. Reply STOP to unsubscribe"
                  className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/20" />
                <p className="mt-1.5 text-[11px] text-ink-muted">Small grey disclaimer shown below the message. Max 60 characters.</p>
              </div>
            </div>

            {/* ── Section 5: Buttons ── */}
            <div className="rounded-xl border border-rule bg-[#f6f8fa]">
              <div className="border-b border-rule px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">Buttons</p>
                    <p className="text-[11px] text-ink-muted mt-0.5">Up to 10 buttons. Max 3 show inline; extra appear as a list.</p>
                  </div>
                  <span className="text-xs text-ink-muted">Optional</span>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {buttons.map((btn, i) => (
                  <ButtonEditor key={i} btn={btn} index={i}
                    onChange={(b) => setButtons((prev) => prev.map((x, j) => j === i ? b : x))}
                    onRemove={() => setButtons((prev) => prev.filter((_, j) => j !== i))} />
                ))}

                {/* Add button menu */}
                {buttons.length < 10 && (
                  <div className="relative" ref={btnMenuRef}>
                    <button type="button" onClick={() => setShowBtnMenu((v) => !v)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-rule py-2.5 text-sm font-medium text-ink-muted hover:border-[#25D366]/50 hover:text-[#075E54] transition">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M12 5v14M5 12h14"/></svg>
                      Add button
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 ml-1"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                    {showBtnMenu && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-rule bg-white shadow-xl">
                        {BTN_TYPES.filter((bt) => {
                          if (bt.max && buttons.filter((b) => b.type === bt.type).length >= bt.max) return false;
                          return true;
                        }).map((bt) => (
                          <button key={bt.type} type="button"
                            onMouseDown={(e) => {
                              e.preventDefault(); // prevent blur/mousedown closing before click
                              setButtons((prev) => [...prev, defaultBtn(bt.type)]);
                              setShowBtnMenu(false);
                            }}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#25D366]/5 transition border-b border-rule/50 last:border-0">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-ink">
                              {bt.icon}
                            </span>
                            <div>
                              <p className="font-semibold text-ink text-sm">{bt.label}</p>
                              <p className="text-[11px] text-ink-muted">{bt.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom submit (mobile) */}
            <div className="lg:hidden pb-8">
              <button form="create-form" type="submit" disabled={submitting}
                className="w-full rounded-xl bg-[#25D366] py-3 text-sm font-semibold text-white hover:bg-[#128C7E] disabled:opacity-60 transition">
                {submitting ? "Saving…" : isEdit ? "Save changes →" : "Submit for review →"}
              </button>
            </div>
          </div>

          {/* ── Right: sticky preview ── */}
          <div className="hidden w-[320px] shrink-0 lg:block">
            <div className="fixed top-[113px] right-0 w-[320px] h-[calc(100vh-113px)] overflow-hidden bg-canvas border-l border-rule px-5 py-6 space-y-5">

              {/* Section label */}
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-rule" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">Preview</span>
                <div className="h-px flex-1 bg-rule" />
              </div>

              {/* Phone frame */}
              <div className="mx-auto w-full max-w-[260px]">
                {/* Phone shell */}
                <div className="relative rounded-[2rem] border-[6px] border-ink/80 bg-[#ECE5DD] shadow-xl overflow-hidden">
                  {/* Status bar */}
                  <div className="flex items-center justify-between bg-[#075E54] px-3 pt-2 pb-1">
                    <span className="text-[9px] font-bold text-white">9:41</span>
                    <div className="flex items-center gap-1">
                      {/* Signal */}
                      <svg viewBox="0 0 24 24" fill="white" className="h-3 w-3 opacity-90">
                        <rect x="2" y="15" width="3" height="6" rx="0.5"/>
                        <rect x="7" y="11" width="3" height="10" rx="0.5"/>
                        <rect x="12" y="7" width="3" height="14" rx="0.5"/>
                        <rect x="17" y="3" width="3" height="18" rx="0.5"/>
                      </svg>
                      {/* WiFi */}
                      <svg viewBox="0 0 24 24" fill="white" className="h-3 w-3 opacity-90">
                        <path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
                      </svg>
                      {/* Battery */}
                      <svg viewBox="0 0 24 10" fill="white" className="h-2.5 w-4 opacity-90">
                        <rect x="0.5" y="0.5" width="20" height="9" rx="2" stroke="white" strokeWidth="1" fill="none"/>
                        <rect x="1.5" y="1.5" width="16" height="7" rx="1.5" fill="white"/>
                        <rect x="21" y="3" width="2.5" height="4" rx="1" fill="white" opacity="0.6"/>
                      </svg>
                    </div>
                  </div>
                  {/* WA chat header */}
                  <div className="flex items-center gap-2 bg-[#075E54] px-2 py-2">
                    {/* Back arrow */}
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 opacity-90">
                      <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={profile.picture ?? "/uploads/logo.png"}
                        alt={profile.name}
                        className="h-8 w-8 rounded-full object-cover bg-white"
                        onError={(e) => { (e.target as HTMLImageElement).src = "/uploads/logo.png"; }}
                      />
                    </div>
                    {/* Name + status */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-white leading-tight">{profile.name}</p>
                      <p className="text-[9px] text-white/70 leading-tight">Business account</p>
                    </div>
                    {/* Action icons */}
                    <div className="flex items-center gap-3 shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 opacity-80"><path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 0110 13a19.5 19.5 0 01-3-9 2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L13.09 9.91A16 16 0 0019 15.91l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 opacity-80"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                    </div>
                  </div>
                  {/* Chat area */}
                  <div className="min-h-[220px] px-2 py-3">
                    <WaBubble
                      headerType={headerType}
                      headerText={headerText}
                      headerMediaUrl={headerMedia.previewUrl ?? headerMedia.url ?? undefined}
                      locationName={locationName}
                      body={body}
                      footer={footerText || undefined}
                      buttons={buttons.map((b) => ({ text: b.text }))}
                    />
                  </div>
                </div>
              </div>

              {/* Review timeline */}
              <div className="rounded-2xl border border-rule bg-[#f6f8fa] overflow-hidden">
                <div className="border-b border-rule bg-canvas px-4 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Review timeline</p>
                </div>
                <div className="px-4 py-3 space-y-3">
                  {([
                    { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>, title: "Submitted", desc: "Sent to Meta for review", color: "#3b82f6" },
                    { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>, title: "Under review", desc: "Usually minutes to 24h", color: "#f59e0b" },
                    { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>, title: "Approved", desc: "Ready to use in campaigns", color: "#22c55e" },
                  ] as { icon: React.ReactNode; title: string; desc: string; color: string }[]).map(({ icon, title, desc, color }, i, arr) => (
                    <div key={title} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: color + "18", color }}>
                          {icon}
                        </div>
                        {i < arr.length - 1 && <div className="mt-1 h-4 w-px bg-rule" />}
                      </div>
                      <div className="pb-1">
                        <p className="text-xs font-semibold text-ink">{title}</p>
                        <p className="text-[11px] text-ink-muted">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the best available image URL for a HEADER component.
 * Meta can return either:
 *   - example.header_url  → a direct public URL (use as-is)
 *   - example.header_handle → either a full CDN URL (use as-is) or an opaque
 *     h:xxxx handle (proxy through our /api/bot/media/preview endpoint)
 */
function resolveHeaderImg(header?: TemplateComponent): string | undefined {
  if (!header) return undefined;
  const url = header.example?.header_url?.[0];
  if (url) return url;
  const handle = header.example?.header_handle?.[0];
  if (!handle) return undefined;
  // Full CDN URL returned by Meta — use directly
  if (handle.startsWith("https://")) return handle;
  // Opaque handle — proxy through our server
  return `/api/bot/media/preview?handle=${encodeURIComponent(handle)}`;
}

// ── Confirm dialog ────────────────────────────────────────────────────────

function ConfirmDialog({ open, title, message, confirmLabel = "Delete", danger = true, onConfirm, onCancel }: {
  open: boolean; title: string; message: string;
  confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className={["flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", danger ? "bg-red-50" : "bg-canvas"].join(" ")}>
            {danger
              ? <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-ink-muted"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            }
          </div>
          <div>
            <p className="text-sm font-bold text-ink">{title}</p>
            <p className="mt-0.5 text-sm text-ink-muted">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel}
            className="flex-1 rounded-xl border border-rule bg-white py-2.5 text-sm font-semibold text-ink hover:bg-canvas transition">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={["flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition", danger ? "bg-red-500 hover:bg-red-600" : "bg-brand hover:opacity-90"].join(" ")}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Template row card ─────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  MARKETING:      "bg-purple-50 text-purple-600 border-purple-100",
  UTILITY:        "bg-blue-50 text-blue-600 border-blue-100",
  AUTHENTICATION: "bg-orange-50 text-orange-600 border-orange-100",
};

const HEADER_ICON: Record<string, React.ReactNode> = {
  IMAGE:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  VIDEO:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
  DOCUMENT: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>,
  LOCATION: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
};

function TemplateCard({ t, onDelete, deleting, onEdit, onDuplicate }: { t: Template; onDelete: () => void; deleting: boolean; onEdit: () => void; onDuplicate: () => void }) {
  const body    = t.components.find((c) => c.type === "BODY");
  const header  = t.components.find((c) => c.type === "HEADER");
  const buttons = t.components.find((c) => c.type === "BUTTONS")?.buttons ?? [];
  const headerImgUrl = resolveHeaderImg(header);
  const hasImage = header?.format === "IMAGE" && headerImgUrl;

  const statusCls = {
    APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PENDING:  "bg-amber-50 text-amber-700 border-amber-200",
    REJECTED: "bg-red-50 text-red-600 border-red-200",
    PAUSED:   "bg-gray-50 text-gray-500 border-gray-200",
  }[t.status] ?? "bg-gray-50 text-gray-500 border-gray-200";

  const statusDot = {
    APPROVED: "bg-emerald-400", PENDING: "bg-amber-400",
    REJECTED: "bg-red-400",     PAUSED: "bg-gray-400",
  }[t.status] ?? "bg-gray-400";

  const catColor: Record<string, string> = {
    MARKETING: "#a855f7",
    UTILITY: "#3b82f6",
    AUTHENTICATION: "#f59e0b",
  };
  const accent = catColor[t.category] ?? "#6b7280";

  return (
    <div className={[
      "group relative flex flex-col rounded-2xl border bg-[#f6f8fa] overflow-hidden transition-all",
      t.status === "REJECTED" ? "border-red-200" : "border-rule",
    ].join(" ")}>
      {/* Top: image banner or gradient header */}
      <div className="relative h-36 w-full overflow-hidden">
        {hasImage
          ? <img src={headerImgUrl} alt="" className="h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
          : <div className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${accent}15 0%, ${accent}08 100%)` }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12 opacity-30"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
        }
        {/* Status + category badges overlaid */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/40 to-transparent px-3 pb-2 pt-6">
          <span className={["inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm", statusCls].join(" ")}>
            <span className={["h-1.5 w-1.5 rounded-full", statusDot].join(" ")} />
            {t.status === "APPROVED" ? "Approved" : t.status === "PENDING" ? "In review" : t.status === "REJECTED" ? "Rejected" : t.status}
          </span>
          <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm"
            style={{ color: accent, borderColor: accent + "50", backgroundColor: accent + "18" }}>
            {t.category.toLowerCase()}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <p className="mb-1.5 text-sm font-semibold text-ink">{t.name}</p>
        <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted flex-1">
          {body?.text ?? "—"}
        </p>

        {/* Meta chips */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {header?.format && header.format !== "NONE" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-canvas border border-rule px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
              {HEADER_ICON[header.format]}
              {header.format.charAt(0) + header.format.slice(1).toLowerCase()}
            </span>
          )}
          {buttons.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-canvas border border-rule px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><rect x="2" y="7" width="20" height="10" rx="2"/></svg>
              {buttons.length} btn{buttons.length !== 1 ? "s" : ""}
            </span>
          )}
          <span className="text-[10px] text-ink-muted ml-auto">{t.language}</span>
        </div>
      </div>

      {/* Footer: Duplicate + Edit + Delete */}
      <div className="flex items-center justify-end gap-1 bg-[#075E54] px-3 py-2">
        {[
          { label: "Duplicate", onClick: onDuplicate, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>, cls: "hover:bg-white/10" },
          { label: "Edit",      onClick: onEdit,      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>, cls: "hover:bg-white/10" },
        ].map(({ label, onClick, icon, cls }) => (
          <div key={label} className="group/tip relative">
            <button onClick={onClick} className={["flex h-7 w-7 items-center justify-center rounded-lg text-white transition", cls].join(" ")}>{icon}</button>
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover/tip:opacity-100">{label}</span>
          </div>
        ))}
        <div className="group/tip relative">
          <button onClick={onDelete} disabled={deleting}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white hover:bg-white/10 hover:text-red-300 disabled:opacity-50 transition">
            {deleting
              ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>}
          </button>
          <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover/tip:opacity-100">Delete</span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "APPROVED", "PENDING", "REJECTED", "DRAFT"];

export default function ManageTemplatesPage() {
  const [templates, setTemplates]   = useState<Template[]>([]);
  const [drafts,    setDrafts]      = useState<TemplateDraft[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [creating, setCreating]         = useState(false);
  const [editing, setEditing]           = useState<Template | null>(null);
  const [duplicating, setDuplicating]   = useState<Template | null>(null);
  const [editingDraft, setEditingDraft] = useState<TemplateDraft | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string; message: string; confirmLabel?: string; onConfirm: () => void;
  } | null>(null);
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState("ALL");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const loadDrafts = useCallback(() => {
    fetch("/api/bot/template-drafts")
      .then((r) => r.json())
      .then((json) => { if (json.ok) setDrafts(json.data ?? []); })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/bot/templates?all=1")
      .then((r) => r.json())
      .then((json) => { if (!json.ok) throw new Error(json.error ?? "Failed"); setTemplates(json.data); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function doDeleteDraft(id: number) {
    setDeletingDraftId(id);
    await fetch("/api/bot/template-drafts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setDeletingDraftId(null);
  }

  function deleteDraft(d: TemplateDraft) {
    setConfirmDialog({
      title: `Delete draft${d.name ? ` "${d.name}"` : ""}?`,
      message: "This draft will be permanently removed. You won't be able to recover it.",
      confirmLabel: "Delete draft",
      onConfirm: () => { setConfirmDialog(null); doDeleteDraft(d.id); },
    });
  }

  useEffect(() => {
    load(); loadDrafts();
    fetch("/api/me").then((r) => r.json()).then((j) => {
      if (j.ok) setIsSuperAdmin(j.data.role === "SUPER_ADMIN");
    }).catch(() => {});
  }, [load]);

  async function doDeleteTemplate(t: Template) {
    setDeletingId(t.id);
    try {
      const res = await fetch("/api/bot/templates/manage", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, name: t.name }) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Delete failed"); }
    finally { setDeletingId(null); }
  }

  function deleteTemplate(t: Template) {
    setConfirmDialog({
      title: `Delete "${t.name}"?`,
      message: "This will permanently remove the template from WhatsApp. This cannot be undone.",
      confirmLabel: "Delete template",
      onConfirm: () => { setConfirmDialog(null); doDeleteTemplate(t); },
    });
  }

  if (creating)     return <CreateForm isSuperAdmin={isSuperAdmin} onCreated={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} onDraftSaved={loadDrafts} />;
  if (editing)      return <CreateForm isSuperAdmin={isSuperAdmin} initialTemplate={editing} onCreated={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />;
  if (duplicating)  return <CreateForm isSuperAdmin={isSuperAdmin} initialTemplate={duplicating} isDuplicate onCreated={() => { setDuplicating(null); load(); }} onCancel={() => setDuplicating(null)} onDraftSaved={loadDrafts} />;
  if (editingDraft) return <CreateForm isSuperAdmin={isSuperAdmin} initialDraft={editingDraft} onCreated={() => { setEditingDraft(null); load(); loadDrafts(); }} onCancel={() => setEditingDraft(null)} onDraftSaved={loadDrafts} />;

  const counts = FILTERS.reduce<Record<string, number>>((a, s) => {
    a[s] = s === "ALL" ? templates.length : s === "DRAFT" ? drafts.length : templates.filter((t) => t.status === s).length;
    return a;
  }, {});

  const visible = templates.filter((t) => {
    const ms = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const mf = filter === "ALL" || t.status === filter;
    return ms && mf;
  });

  const visibleDrafts = drafts.filter((d) =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = templates.filter((t) => t.status === "PENDING").length;

  return (
    <div className="min-h-screen bg-white">
      <div className="px-6 py-4 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-[#64748b]">Create, edit and review your WhatsApp message templates.</p>
          <button onClick={() => setCreating(true)}
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-[13px] font-semibold text-white hover:bg-[#1DA851] transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M12 5v14M5 12h14"/></svg>
            New template
          </button>
        </div>

        {/* Toolbar: tabs + search */}
        <div className="mt-4 flex flex-wrap items-end gap-2 border-b border-[#e5e7eb] pb-0">
          {/* Filter tabs */}
          <div className="flex items-end gap-3">
            {FILTERS.map((f) => {
              const label = f === "ALL" ? "All" : STATUS[f]?.label ?? f;
              const active = filter === f;
              const dotCfg: Record<string, string> = {
                APPROVED: "bg-emerald-500", PENDING: "bg-amber-400",
                REJECTED: "bg-red-500",     DRAFT:   "bg-slate-400",
              };
              return (
                <button key={f} onClick={() => setFilter(f)}
                  className={[
                    "flex items-center gap-1.5 pb-2.5 text-[13px] font-medium transition-colors border-b-2",
                    active
                      ? "border-[#0f172a] text-[#0f172a]"
                      : "border-transparent text-[#64748b] hover:text-[#374151]",
                  ].join(" ")}>
                  {f !== "ALL" && (
                    <span className={["h-1.5 w-1.5 rounded-full shrink-0", dotCfg[f]].join(" ")} />
                  )}
                  {label}
                  <span className={[
                    "rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                    active ? "bg-[#0f172a] text-white" : "bg-[#f1f5f9] text-[#64748b]",
                  ].join(" ")}>
                    {counts[f]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search + Refresh */}
          <div className="ml-auto flex items-center gap-2 pb-3">
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="search" placeholder="Search templates…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-48 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] pl-8 pr-3 text-[13px] text-[#0f172a] placeholder:text-[#9ca3af] focus:bg-white focus:outline-none transition" />
            </div>
            <button onClick={load}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#f6f8fa] transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[#6b7280]"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Pending banner */}
        {pendingCount > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-amber-500"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <p className="text-xs text-amber-800">{pendingCount} template{pendingCount !== 1 ? "s" : ""} under review — usually approved within 24 hours.</p>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>
        )}
      </div>

      {/* List */}
      <div className="px-6 pb-8 lg:px-8">
        {/* ── Draft tab ── */}
        {filter === "DRAFT" ? (
          visibleDrafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rule bg-white py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
              </div>
              <p className="text-sm font-semibold text-ink">No drafts yet</p>
              <p className="mt-1 text-xs text-ink-muted">Use &ldquo;Save as draft&rdquo; while creating a template to save your progress.</p>
              <button onClick={() => setCreating(true)} className="mt-4 rounded-xl bg-[#25D366] px-5 py-2 text-sm font-semibold text-white hover:bg-[#128C7E] transition">
                + New template
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleDrafts.map((d) => (
                <div key={d.id} className="group flex flex-col rounded-2xl border border-slate-200 bg-[#f6f8fa] overflow-hidden transition-all hover:border-slate-300">
                  {/* Header area */}
                  <div className="flex h-36 items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12 opacity-40"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
                  </div>
                  {/* Content */}
                  <div className="flex flex-1 flex-col p-4">
                    <div className="mb-1.5 flex items-center gap-2">
                      <p className="flex-1 truncate text-sm font-semibold text-ink">{d.name || <span className="italic text-ink-muted">Untitled draft</span>}</p>
                      <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Draft</span>
                    </div>
                    <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-ink-muted">{d.body || "No body text yet."}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md border border-rule bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">{d.category.toLowerCase()}</span>
                      {d.header_type !== "NONE" && (
                        <span className="rounded-md border border-rule bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">{d.header_type.charAt(0) + d.header_type.slice(1).toLowerCase()}</span>
                      )}
                      <span className="ml-auto text-[10px] text-ink-muted">{new Date(d.updated_at).toLocaleDateString("en-AE", { day: "numeric", month: "short" })}</span>
                    </div>
                  </div>
                  {/* Footer */}
                  <div className="flex items-center gap-1 bg-slate-700 px-3 py-2">
                    <span className="flex-1 text-[11px] font-medium text-slate-300 truncate">{d.created_by ?? ""}</span>
                    {/* Edit draft */}
                    <div className="group/tip relative">
                      <button onClick={() => setEditingDraft(d)} className="flex h-7 w-7 items-center justify-center rounded-lg text-white hover:bg-white/10 transition">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover/tip:opacity-100">Edit draft</span>
                    </div>
                    {/* Submit for review */}
                    <div className="group/tip relative">
                      <button onClick={() => setEditingDraft(d)} className="flex h-7 items-center gap-1.5 rounded-lg bg-[#25D366]/20 px-2 text-[11px] font-semibold text-[#25D366] hover:bg-[#25D366]/30 transition">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        Submit
                      </button>
                      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover/tip:opacity-100">Open & submit for review</span>
                    </div>
                    {/* Delete draft */}
                    <div className="group/tip relative">
                      <button onClick={() => deleteDraft(d)} disabled={deletingDraftId === d.id} className="flex h-7 w-7 items-center justify-center rounded-lg text-white hover:bg-white/10 hover:text-red-300 disabled:opacity-50 transition">
                        {deletingDraftId === d.id
                          ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>}
                      </button>
                      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover/tip:opacity-100">Delete</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-rule bg-[#f6f8fa] overflow-hidden">
                <div className="h-36 animate-pulse bg-canvas" />
                <div className="p-4 space-y-2.5">
                  <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-canvas" />
                  <div className="h-3 w-full animate-pulse rounded-full bg-canvas" />
                  <div className="h-3 w-4/5 animate-pulse rounded-full bg-canvas" />
                  <div className="mt-3 flex gap-2">
                    <div className="h-5 w-16 animate-pulse rounded-full bg-canvas" />
                    <div className="h-5 w-10 animate-pulse rounded-full bg-canvas" />
                  </div>
                </div>
                <div className="h-9 animate-pulse bg-canvas border-t border-rule" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rule bg-white py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25D366]/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <p className="text-sm font-semibold text-ink">{templates.length === 0 ? "No templates yet" : "No matches"}</p>
            <p className="mt-1 text-xs text-ink-muted">{templates.length === 0 ? "Create your first template to get started." : "Try a different filter."}</p>
            {templates.length === 0 && (
              <button onClick={() => setCreating(true)} className="mt-4 rounded-xl bg-[#25D366] px-5 py-2 text-sm font-semibold text-white hover:bg-[#128C7E] transition">
                + New template
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((t) => <TemplateCard key={t.id} t={t} deleting={deletingId === t.id} onDelete={() => deleteTemplate(t)} onEdit={() => setEditing(t)} onDuplicate={() => setDuplicating(t)} />)}
          </div>
        )}
      </div>

      {confirmDialog && (
        <ConfirmDialog
          open={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
