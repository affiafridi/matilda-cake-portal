"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Flow = {
  id: number; name: string; description?: string;
  triggerKeywords: string; isActive: boolean; sortOrder: number;
  steps: { id: number }[];
};

const IcFlow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
    <rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
    <rect x="8" y="16" width="8" height="5" rx="1"/>
    <path d="M6.5 8v3a2 2 0 002 2h7a2 2 0 002-2V8M12 11v5"/>
  </svg>
);

const IcPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);

const IcRefresh = ({ spin }: { spin?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${spin ? "animate-spin" : ""}`}>
    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
    <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15"/>
  </svg>
);

export default function FlowsPage() {
  const router = useRouter();
  const [flows,     setFlows]     = useState<Flow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [newName,   setNewName]   = useState("");
  const [showNew,   setShowNew]   = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadMsg, setReloadMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/flows").then((r) => r.json());
    if (r.ok) setFlows(r.data);
    setLoading(false);
  }

  async function createFlow() {
    if (!newName.trim()) return;
    setCreating(true);
    const r = await fetch("/api/admin/flows", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    }).then((r) => r.json());
    if (r.ok) {
      setNewName(""); setShowNew(false);
      router.push(`/wa/flows/${r.data.id}`);
    }
    setCreating(false);
  }

  async function toggleActive(flow: Flow, e: React.MouseEvent) {
    e.stopPropagation();
    const newActive = !flow.isActive;

    await fetch(`/api/admin/flows/${flow.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: newActive }),
    });

    // Server enforces single-active — mirror that in local state
    setFlows((p) => p.map((f) => {
      if (f.id === flow.id) return { ...f, isActive: newActive };
      if (newActive) return { ...f, isActive: false };
      return f;
    }));
  }

  async function deleteFlow(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this flow?")) return;
    await fetch(`/api/admin/flows/${id}`, { method: "DELETE" });
    setFlows((p) => p.filter((f) => f.id !== id));
  }

  async function reloadBot() {
    setReloading(true); setReloadMsg(null);
    try {
      const r = await fetch("/api/admin/flows/reload-bot", { method: "POST" }).then((r) => r.json());
      setReloadMsg(r.ok ? { ok: true, text: "Bot updated successfully" } : { ok: false, text: r.error ?? "Failed" });
    } catch { setReloadMsg({ ok: false, text: "Could not reach bot" }); }
    setReloading(false);
    setTimeout(() => setReloadMsg(null), 4000);
  }

  const activeFlows   = flows.filter((f) => f.isActive);
  const inactiveFlows = flows.filter((f) => !f.isActive);

  return (
    <div className="px-6 py-6 lg:px-8 w-full">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Flow Builder</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Build WhatsApp conversations with tap buttons — no typing needed from customers.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {reloadMsg && (
            <span className={`text-xs font-medium px-3 py-1.5 rounded-lg ${reloadMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
              {reloadMsg.text}
            </span>
          )}
          <button type="button" onClick={reloadBot} disabled={reloading}
            title="Push changes to the bot"
            className="flex items-center gap-1.5 rounded-lg border border-rule px-3 py-2 text-sm font-medium text-ink-muted hover:bg-canvas disabled:opacity-40 transition">
            <IcRefresh spin={reloading} />
            {reloading ? "Pushing…" : "Push to Bot"}
          </button>
          <button type="button" onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark transition">
            <IcPlus /> New Flow
          </button>
        </div>
      </div>

      {/* New flow modal-style inline */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <h2 className="text-lg font-bold text-ink">Create a new flow</h2>
            <p className="text-sm text-ink-muted">Give it a name. You can change everything inside the editor.</p>
            <input autoFocus value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createFlow()}
              placeholder="e.g. Order Flow, Product Inquiry, Support Menu…"
              className="w-full rounded-xl border border-rule bg-canvas px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30" />
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={createFlow} disabled={creating || !newName.trim()}
                className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition">
                {creating ? "Creating…" : "Create & Edit →"}
              </button>
              <button type="button" onClick={() => { setShowNew(false); setNewName(""); }}
                className="rounded-xl border border-rule px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-canvas transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-rule bg-white overflow-hidden p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl animate-pulse bg-canvas shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-2/3 animate-pulse rounded-full bg-canvas" />
                  <div className="h-3 w-1/3 animate-pulse rounded-full bg-canvas" />
                </div>
              </div>
              <div className="h-3 w-full animate-pulse rounded-full bg-canvas" />
              <div className="h-3 w-4/5 animate-pulse rounded-full bg-canvas" />
              <div className="flex gap-2 pt-1">
                <div className="h-8 flex-1 animate-pulse rounded-xl bg-canvas" />
                <div className="h-8 flex-1 animate-pulse rounded-xl bg-canvas" />
              </div>
            </div>
          ))}
        </div>
      ) : flows.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="h-16 w-16 rounded-2xl bg-brand/10 flex items-center justify-center text-brand">
            <IcFlow />
          </div>
          <div className="text-center space-y-1">
            <p className="font-semibold text-ink">No flows yet</p>
            <p className="text-sm text-ink-muted">Create your first flow to guide customers with tap buttons on WhatsApp.</p>
          </div>
          <button type="button" onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark transition">
            <IcPlus /> Create your first flow
          </button>
        </div>
      ) : (
        <div className="space-y-8">

          {/* Active flows */}
          {activeFlows.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-widest mb-3">
                Active — {activeFlows.length} flow{activeFlows.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {activeFlows.map((flow) => (
                  <FlowCard key={flow.id} flow={flow}
                    onToggle={(e) => toggleActive(flow, e)}
                    onDelete={(e) => deleteFlow(flow.id, e)}
                    onClick={() => router.push(`/wa/flows/${flow.id}`)} />
                ))}
                <NewFlowCard onClick={() => setShowNew(true)} />
              </div>
            </section>
          )}

          {/* Inactive flows */}
          {inactiveFlows.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-widest mb-3">
                Inactive — {inactiveFlows.length} flow{inactiveFlows.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {inactiveFlows.map((flow) => (
                  <FlowCard key={flow.id} flow={flow}
                    onToggle={(e) => toggleActive(flow, e)}
                    onDelete={(e) => deleteFlow(flow.id, e)}
                    onClick={() => router.push(`/wa/flows/${flow.id}`)} />
                ))}
                {activeFlows.length === 0 && <NewFlowCard onClick={() => setShowNew(true)} />}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Tip */}
      {flows.length > 0 && (
        <p className="mt-10 text-xs text-ink-muted text-center">
          After editing flows, click <strong>Push to Bot</strong> so changes go live instantly.
        </p>
      )}

    </div>
  );
}

function FlowCard({ flow, onToggle, onDelete, onClick }: {
  flow: Flow;
  onToggle: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onClick: () => void;
}) {
  const keywords = flow.triggerKeywords ? flow.triggerKeywords.split(",").map((k) => k.trim()).filter(Boolean) : [];

  return (
    <div onClick={onClick}
      className={`group relative rounded-2xl border bg-surface p-5 cursor-pointer transition-all hover:-translate-y-0.5 ${flow.isActive ? "border-rule" : "border-dashed border-rule opacity-60"}`}>

      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="h-9 w-9 rounded-xl bg-brand/10 flex items-center justify-center text-brand shrink-0">
          <IcFlow />
        </div>
        {/* Toggle */}
        <button type="button" onClick={onToggle}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${flow.isActive ? "bg-brand" : "bg-rule"}`}>
          <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${flow.isActive ? "translate-x-4" : ""}`} />
        </button>
      </div>

      <p className="font-semibold text-sm text-ink leading-snug mb-1">{flow.name}</p>
      {flow.description && <p className="text-xs text-ink-muted truncate mb-3">{flow.description}</p>}

      {/* Keywords */}
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {keywords.slice(0, 4).map((k) => (
            <span key={k} className="rounded-full bg-canvas border border-rule px-2 py-0.5 text-[10px] font-medium text-ink-muted font-mono">
              {k}
            </span>
          ))}
          {keywords.length > 4 && (
            <span className="rounded-full bg-canvas border border-rule px-2 py-0.5 text-[10px] text-ink-muted">+{keywords.length - 4}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-rule">
        <span className="text-[11px] text-ink-muted">
          {flow.steps.length} step{flow.steps.length !== 1 ? "s" : ""}
        </span>
        <button type="button" onClick={onDelete}
          className="text-[11px] text-ink-muted hover:text-red-500 transition opacity-0 group-hover:opacity-100">
          Delete
        </button>
      </div>
    </div>
  );
}

function NewFlowCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-2xl border-2 border-dashed border-rule bg-transparent p-5 cursor-pointer hover:border-brand hover:bg-brand/5 transition-all group flex flex-col items-center justify-center gap-2 min-h-[160px]">
      <div className="h-9 w-9 rounded-xl border-2 border-dashed border-rule group-hover:border-brand flex items-center justify-center text-ink-muted group-hover:text-brand transition">
        <IcPlus />
      </div>
      <p className="text-sm font-medium text-ink-muted group-hover:text-brand transition">New flow</p>
    </button>
  );
}

