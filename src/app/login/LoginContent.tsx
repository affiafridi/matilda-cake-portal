"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  ADMIN:       "/admin",
  AGENT:    "/wa/inbox",
  OPERATOR: "/operator",
};

export function LoginContent({ appName, logoUrl }: { appName: string; logoUrl: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const next   = search.get("next");

  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res  = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true;  data: { role: string } }
        | { ok: false; error: string }
        | null;
      if (!res.ok || !json || !json.ok) {
        setError((json && !json.ok && json.error) || "Login failed.");
        return;
      }
      const dest = next || ROLE_HOME[json.data.role] || "/";
      router.replace(dest);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-rule bg-surface p-6 sm:p-8">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl && <img src={logoUrl} alt={appName} className="mx-auto h-14 w-auto" />}
          <h1 className="mt-4 text-2xl font-semibold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-ink-muted">Internal portal access only.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              suppressHydrationWarning
              className="block w-full rounded-lg border border-rule bg-canvas px-3.5 py-2.5 text-base sm:text-sm text-ink focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              suppressHydrationWarning
              className="block w-full rounded-lg border border-rule bg-canvas px-3.5 py-2.5 text-base sm:text-sm text-ink focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
