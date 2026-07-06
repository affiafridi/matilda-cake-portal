"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function IconPalette() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { label: "Admin Account", icon: <IconUser /> },
  { label: "Brand",         icon: <IconPalette /> },
  { label: "Done",          icon: <IconCheck /> },
];

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={[
            "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
            i < step
              ? "border-[#6b2e1a] bg-[#6b2e1a] text-white"
              : i === step
                ? "border-[#6b2e1a] bg-white text-[#6b2e1a]"
                : "border-gray-200 bg-white text-gray-400",
          ].join(" ")}>
            {i < step ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : s.icon}
          </div>
          <span className={[
            "hidden sm:block text-sm font-medium",
            i === step ? "text-gray-900" : "text-gray-400",
          ].join(" ")}>{s.label}</span>
          {i < STEPS.length - 1 && (
            <div className={["h-px w-8 sm:w-12", i < step ? "bg-[#6b2e1a]" : "bg-gray-200"].join(" ")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label, type = "text", value, onChange, placeholder, hint, error,
}: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; hint?: string; error?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-800 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        suppressHydrationWarning
        className={[
          "w-full rounded-xl border px-4 py-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 transition-colors",
          error
            ? "border-red-400 focus:border-red-400 focus:ring-red-100"
            : "border-gray-200 focus:border-[#c08a5b] focus:ring-[#c08a5b]/20",
        ].join(" ")}
      />
      {hint  && !error && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SetupClient() {
  const router = useRouter();
  const [step,  setStep]  = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy,  setBusy]  = useState(false);

  // Step 0 — admin account
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");

  // Step 1 — brand
  const [appName, setAppName]   = useState("");
  const [color,   setColor]     = useState("#6b2e1a");

  // ── Step 0 submit ──────────────────────────────────────────────────────────
  function validateStep0() {
    if (!name.trim())  return "Full name is required.";
    if (!email.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(password)) return "Password needs an uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password needs a lowercase letter.";
    if (!/[0-9]/.test(password)) return "Password needs a number.";
    if (!/[^A-Za-z0-9]/.test(password)) return "Password needs a special character.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  function nextStep() {
    setError(null);
    if (step === 0) {
      const err = validateStep0();
      if (err) { setError(err); return; }
      // Pre-fill app name suggestion
      if (!appName) setAppName(name.trim() + " Portal");
      setStep(1);
    }
  }

  // ── Final submit ───────────────────────────────────────────────────────────
  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res  = await fetch("/api/setup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:          name.trim(),
          email:         email.trim().toLowerCase(),
          password,
          app_name:      appName.trim() || name.trim() + " Portal",
          primary_color: color,
        }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStep(2);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6b2e1a] text-white mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome</h1>
          <p className="mt-1 text-sm text-gray-500">
            {step < 2 ? "Set up your portal in two quick steps." : "Your portal is ready."}
          </p>
        </div>

        {/* Step indicator */}
        <StepIndicator step={step} />

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">

          {/* ── Step 0: Admin Account ── */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Create your admin account</h2>
              <p className="text-sm text-gray-500 mb-5">This will be your super admin login.</p>
              <Field label="Full Name"    value={name}     onChange={setName}     placeholder="Jane Smith" />
              <Field label="Email"        type="email" value={email}    onChange={setEmail}    placeholder="you@company.com" />
              <Field label="Password"     type="password" value={password} onChange={setPassword}
                hint="Min 8 chars, uppercase, lowercase, number, special character." />
              <Field label="Confirm Password" type="password" value={confirm}  onChange={setConfirm}  placeholder="" error={error ?? undefined} />

              <button
                type="button"
                onClick={nextStep}
                className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl bg-[#6b2e1a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#5a2516] transition-colors"
              >
                Continue <IconArrowRight />
              </button>
            </div>
          )}

          {/* ── Step 1: Brand ── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Brand your portal</h2>
              <p className="text-sm text-gray-500 mb-5">You can change these any time from Settings.</p>

              <Field label="Portal Name" value={appName} onChange={setAppName}
                placeholder="My Company Portal"
                hint="Shown in the browser tab and login page." />

              {/* Color picker */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Brand Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-11 w-16 cursor-pointer rounded-lg border border-gray-200 bg-white p-0.5"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    suppressHydrationWarning
                    className="w-36 rounded-xl border border-gray-200 px-4 py-3 font-mono text-sm text-gray-900 bg-white focus:border-[#c08a5b] focus:outline-none focus:ring-2 focus:ring-[#c08a5b]/20"
                    placeholder="#6b2e1a"
                  />
                  <div className="h-11 w-11 rounded-xl border border-gray-200 flex-shrink-0" style={{ background: color }} />
                </div>
                <p className="mt-1.5 text-xs text-gray-500">The entire UI rethemes from this one color.</p>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setError(null); setStep(0); }}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#6b2e1a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#5a2516] disabled:opacity-60 transition-colors"
                >
                  {busy ? <Spinner /> : null}
                  {busy ? "Setting up…" : "Finish Setup"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Done ── */}
          {step === 2 && (
            <div className="text-center py-4 space-y-5">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-50 border-2 border-green-400 text-green-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">All done!</h2>
                <p className="mt-1.5 text-sm text-gray-500">
                  Your portal is ready. Log in with the account you just created.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#6b2e1a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#5a2516] transition-colors"
              >
                Go to Login <IconArrowRight />
              </button>
            </div>
          )}

        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Already set up?{" "}
          <a href="/login" className="underline hover:text-gray-600">Sign in</a>
        </p>
      </div>
    </div>
  );
}
