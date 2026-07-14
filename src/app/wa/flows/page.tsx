"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Flow = {
  id: number; name: string; description?: string;
  triggerKeywords: string; isActive: boolean; sortOrder: number;
  steps: { id: number }[];
};

const IcFlow = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
    <rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
    <rect x="8" y="16" width="8" height="5" rx="1"/>
    <path d="M6.5 8v3a2 2 0 002 2h7a2 2 0 002-2V8M12 11v5"/>
  </svg>
);

const IcPlus = ({ size = 15 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
    <path d="M12 5v14M5 12h14"/>
  </svg>
);

const IcRefresh = ({ spin }: { spin?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${spin ? "animate-spin" : ""}`}>
    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
    <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15"/>
  </svg>
);

const IcTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
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
    if (r.ok) { setNewName(""); setShowNew(false); router.push(`/wa/flows/${r.data.id}`); }
    setCreating(false);
  }

  async function toggleActive(flow: Flow, e: React.MouseEvent) {
    e.stopPropagation();
    const newActive = !flow.isActive;
    await fetch(`/api/admin/flows/${flow.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: newActive }),
    });
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

      {/* Page header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[18px] font-bold text-[#0f172a] leading-tight">Flow Builder</h1>
          <p className="text-[12.5px] text-[#64748b] mt-0.5">{flows.length} flow{flows.length !== 1 ? "s" : ""} total</p>
        </div>
        <div className="flex items-center gap-2">
          {reloadMsg && (
            <span className={`text-[12px] font-medium px-3 py-1.5 rounded-lg border ${reloadMsg.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`}>
              {reloadMsg.text}
            </span>
          )}
          <button type="button" onClick={reloadBot} disabled={reloading}
            className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3.5 py-2 text-[13px] font-medium text-[#374151] hover:bg-[#f6f8fa] disabled:opacity-40 transition">
            <IcRefresh spin={reloading} />
            {reloading ? "Pushing…" : "Push to Bot"}
          </button>
          <button type="button" onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#0f172a] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#1e293b] transition">
            <IcPlus /> New Flow
          </button>
        </div>
      </div>

      {/* New flow modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => { setShowNew(false); setNewName(""); }}>
          <div onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-[#e5e7eb] p-6 w-full max-w-md mx-4 space-y-4">
            <h2 className="text-[16px] font-bold text-[#0f172a]">New Flow</h2>
            <p className="text-[13px] text-[#64748b]">Give it a name — you can change everything inside the editor.</p>
            <input autoFocus value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createFlow()}
              placeholder="e.g. Order Flow, Product Inquiry…"
              className="w-full rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] px-4 py-2.5 text-[13px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20 focus:border-[#0f172a]" />
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={createFlow} disabled={creating || !newName.trim()}
                className="flex-1 rounded-xl bg-[#0f172a] py-2.5 text-[13px] font-semibold text-white hover:bg-[#1e293b] disabled:opacity-40 transition">
                {creating ? "Creating…" : "Create & Open →"}
              </button>
              <button type="button" onClick={() => { setShowNew(false); setNewName(""); }}
                className="rounded-xl border border-[#e5e7eb] px-4 py-2.5 text-[13px] font-medium text-[#374151] hover:bg-[#f6f8fa] transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-[#e5e7eb] bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-xl animate-pulse bg-[#f1f5f9]" />
                <div className="h-5 w-9 rounded-full animate-pulse bg-[#f1f5f9]" />
              </div>
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-[#f1f5f9]" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-[#f1f5f9]" />
              <div className="h-px w-full bg-[#f1f5f9] mt-2" />
              <div className="h-3 w-1/4 animate-pulse rounded-full bg-[#f1f5f9]" />
            </div>
          ))}
        </div>
      ) : flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="h-14 w-14 rounded-2xl bg-[#f6f8fa] border border-[#e5e7eb] flex items-center justify-center text-[#9ca3af]">
            <IcFlow size={24} />
          </div>
          <div className="text-center space-y-1">
            <p className="font-semibold text-[#0f172a] text-[14px]">No flows yet</p>
            <p className="text-[13px] text-[#64748b]">Create your first flow to guide customers through WhatsApp.</p>
          </div>
          <button type="button" onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded-xl bg-[#0f172a] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#1e293b] transition">
            <IcPlus /> Create first flow
          </button>
        </div>
      ) : (
        <div className="space-y-7">

          {activeFlows.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">
                Active — {activeFlows.length} flow{activeFlows.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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

          {inactiveFlows.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">
                Inactive — {inactiveFlows.length} flow{inactiveFlows.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
    </div>
  );
}

function FlowCard({ flow, onToggle, onDelete, onClick }: {
  flow: Flow;
  onToggle: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onClick: () => void;
}) {
  const keywords = flow.triggerKeywords
    ? flow.triggerKeywords.split(",").map((k) => k.trim()).filter(Boolean)
    : [];

  return (
    <div onClick={onClick}
      className={`group relative rounded-xl border bg-[#f6f8fa] p-5 cursor-pointer transition-all hover:shadow-sm ${flow.isActive ? "border-[#e5e7eb]" : "border-dashed border-[#e5e7eb] opacity-60"}`}>

      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="h-9 w-9 rounded-xl bg-white border border-[#e5e7eb] flex items-center justify-center text-[#374151] shrink-0">
          <IcFlow size={16} />
        </div>
        <button type="button" onClick={onToggle}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${flow.isActive ? "bg-[#0f172a]" : "bg-[#e5e7eb]"}`}>
          <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${flow.isActive ? "translate-x-4" : ""}`} />
        </button>
      </div>

      <p className="font-semibold text-[13px] text-[#0f172a] leading-snug mb-0.5">{flow.name}</p>
      {flow.description && (
        <p className="text-[12px] text-[#64748b] truncate mb-2">{flow.description}</p>
      )}

      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 mb-1">
          {keywords.slice(0, 3).map((k) => (
            <span key={k} className="rounded-full bg-white border border-[#e5e7eb] px-2 py-0.5 text-[10px] font-medium text-[#64748b] font-mono">
              {k}
            </span>
          ))}
          {keywords.length > 3 && (
            <span className="rounded-full bg-white border border-[#e5e7eb] px-2 py-0.5 text-[10px] text-[#9ca3af]">
              +{keywords.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 mt-2 border-t border-[#f1f5f9]">
        <span className="text-[11px] text-[#9ca3af]">
          {flow.steps.length} step{flow.steps.length !== 1 ? "s" : ""}
        </span>
        <button type="button" onClick={onDelete}
          className="flex items-center gap-1 text-[11px] text-[#9ca3af] hover:text-red-500 transition opacity-0 group-hover:opacity-100">
          <IcTrash /> Delete
        </button>
      </div>
    </div>
  );
}

function NewFlowCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-xl border-2 border-dashed border-[#e5e7eb] bg-transparent cursor-pointer hover:border-[#0f172a] hover:bg-[#f6f8fa] transition-all group flex flex-col items-center justify-center gap-2 min-h-[152px]">
      <div className="h-9 w-9 rounded-xl border-2 border-dashed border-[#e5e7eb] group-hover:border-[#0f172a] flex items-center justify-center text-[#d1d5db] group-hover:text-[#0f172a] transition">
        <IcPlus size={16} />
      </div>
      <p className="text-[12px] font-medium text-[#9ca3af] group-hover:text-[#0f172a] transition">New flow</p>
    </button>
  );
}
