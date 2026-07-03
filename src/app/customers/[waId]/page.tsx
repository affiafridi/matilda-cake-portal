"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Customer = {
  wa_id: string;
  name: string;
  language: string;
  first_seen: string;
  last_seen: string;
  total_messages: number;
};

type Conversation = {
  id: string | number;
  wa_id: string;
  message: string;
  intent: string;
  bot_response: string;
  created_at: string;
};

type Handoff = {
  id: string | number;
  wa_id: string;
  message: string;
  created_at: string;
};

type Tab = "conversations" | "handoffs";

function fmt(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CustomerDetailPage() {
  const { waId } = useParams<{ waId: string }>();
  const router = useRouter();
  const [data, setData] = useState<{
    customer: Customer;
    conversations: Conversation[];
    handoffs: Handoff[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("conversations");

  useEffect(() => {
    fetch(`/api/bot/customers/${encodeURIComponent(waId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Failed to load");
        setData(json.data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [waId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas px-6 py-5 lg:px-8">
        <div className="h-5 w-32 animate-pulse rounded-lg bg-cream/60 mb-6" />
        <div className="mb-4 h-36 animate-pulse rounded-2xl bg-cream/40" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-cream/40" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-canvas px-6 py-5 lg:px-8">
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error ?? "Customer not found"}
        </div>
        <button onClick={() => router.back()} className="mt-4 text-sm text-brand hover:underline">
          Back
        </button>
      </div>
    );
  }

  const { customer, conversations, handoffs } = data;

  return (
    <div className="min-h-screen bg-canvas px-6 py-5 lg:px-8">
      {/* Back */}
      <Link
        href="/customers"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        All Customers
      </Link>

      {/* Customer profile card */}
      <div className="mb-5 rounded-2xl border border-rule bg-white overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-ink">{customer.name || "Unknown"}</h1>
              <p className="mt-0.5 font-mono text-sm text-ink-muted">{customer.wa_id}</p>
            </div>
          </div>

          {/* WhatsApp badge */}
          <div className="flex items-center gap-2 rounded-xl border border-[#25d36620] bg-[#25d36610] px-3 py-1.5 text-xs font-medium text-[#128c7e] self-start">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.529 5.845L.057 23.854l6.161-1.615A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.007-1.371l-.359-.213-3.725.976.993-3.632-.234-.373A9.818 9.818 0 0 1 2.182 12C2.182 6.573 6.573 2.182 12 2.182S21.818 6.573 21.818 12 17.427 21.818 12 21.818z" />
            </svg>
            WhatsApp
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 divide-x divide-y divide-rule border-t border-rule sm:grid-cols-4 sm:divide-y-0">
          <StatCell label="Language" value={customer.language || "—"} />
          <StatCell label="Total Messages" value={String(customer.total_messages ?? 0)} />
          <StatCell label="First Seen" value={fmtShort(customer.first_seen)} />
          <StatCell label="Last Seen" value={fmtShort(customer.last_seen)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border border-rule bg-white p-1 w-fit">
        {(["conversations", "handoffs"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition",
              tab === t
                ? "bg-brand text-white shadow-sm"
                : "text-ink-muted hover:text-ink",
            ].join(" ")}
          >
            {t}
            <span className="ml-1.5 text-xs opacity-70">
              ({t === "conversations" ? conversations.length : handoffs.length})
            </span>
          </button>
        ))}
      </div>

      {/* Conversations tab */}
      {tab === "conversations" && (
        <div className="space-y-3">
          {conversations.length === 0 ? (
            <Empty text="No conversations found." />
          ) : (
            conversations.map((c) => (
              <div key={c.id} className="rounded-2xl border border-rule bg-white overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-rule bg-canvas px-4 py-2.5">
                  {c.intent ? (
                    <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
                      {c.intent}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-muted">General</span>
                  )}
                  <span className="text-xs text-ink-muted">{fmt(c.created_at)}</span>
                </div>
                <div className="space-y-2 p-4">
                  <Bubble side="user" text={c.message} />
                  {c.bot_response && <Bubble side="bot" text={c.bot_response} />}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Handoffs tab */}
      {tab === "handoffs" && (
        <div className="space-y-3">
          {handoffs.length === 0 ? (
            <Empty text="No handoff requests found." />
          ) : (
            handoffs.map((h) => (
              <div key={h.id} className="rounded-2xl border border-danger/25 bg-white overflow-hidden">
                <div className="flex items-center justify-between border-b border-danger/20 bg-danger/5 px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-danger">
                    <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                    Handoff Request
                  </span>
                  <span className="text-xs text-ink-muted">{fmt(h.created_at)}</span>
                </div>
                <p className="px-4 py-3.5 text-sm text-ink">{h.message}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function fmtShort(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function Bubble({ side, text }: { side: "user" | "bot"; text: string }) {
  return (
    <div className={`flex ${side === "user" ? "justify-end" : "justify-start"}`}>
      {side === "bot" && (
        <div className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25d366]/15 text-[#128c7e] self-end mb-0.5">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.529 5.845L.057 23.854l6.161-1.615A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.007-1.371l-.359-.213-3.725.976.993-3.632-.234-.373A9.818 9.818 0 0 1 2.182 12C2.182 6.573 6.573 2.182 12 2.182S21.818 6.573 21.818 12 17.427 21.818 12 21.818z" />
          </svg>
        </div>
      )}
      <div
        className={[
          "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          side === "user"
            ? "rounded-br-sm bg-brand text-white"
            : "rounded-bl-sm bg-[#f0faf3] text-ink border border-[#25d36620]",
        ].join(" ")}
      >
        {text}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-white py-14 text-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 h-8 w-8 text-ink-muted/40">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <p className="text-sm text-ink-muted">{text}</p>
    </div>
  );
}
