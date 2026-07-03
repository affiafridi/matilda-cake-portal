"use client";

import { useEffect, useState } from "react";

type Cred = { label: string; env: string; value: string };

export default function WaSettingsPage() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [credentials, setCredentials]   = useState<Cred[]>([]);

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
  }, []);

  return (
    <div className="px-6 py-5 lg:px-8 max-w-2xl">
      <h1 className="text-xl font-bold text-ink">WhatsApp Settings</h1>
      <p className="mt-0.5 text-sm text-ink-muted mb-6">
        Configure your Meta WhatsApp Business API credentials.
      </p>

      <div className="rounded-xl border border-rule bg-surface p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#25D366] text-white text-[10px] font-bold">W</span>
            API Credentials
          </h2>
          <div className="space-y-1 text-sm">
            {credentials.map((item) => (
              <div key={item.env} className="flex items-center justify-between rounded-lg bg-cream/40 px-3 py-2.5 gap-4 overflow-hidden">
                <span className="text-ink-muted shrink-0">{item.label}</span>
                <code className="text-xs text-ink bg-canvas rounded px-2 py-0.5 font-mono tracking-wide truncate max-w-[260px]">{item.value}</code>
              </div>
            ))}
          </div>
        </div>

        {isSuperAdmin && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium mb-1">How to configure</p>
            <p className="text-xs leading-relaxed">
              Set these environment variables in your Cloud Run service. Go to{" "}
              <strong>GCP Console → Cloud Run → matilda-portal → Edit &amp; Deploy → Variables</strong>.
              Get the values from{" "}
              <strong>Meta Business Suite → WhatsApp → API Setup</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
