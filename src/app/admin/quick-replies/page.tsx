"use client";

import { useEffect, useState, type FormEvent } from "react";

type QuickReply = { id: string; shortcut: string; body: string; updatedAt: string };

export default function QuickRepliesPage() {
  const [replies,   setReplies]   = useState<QuickReply[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [shortcut,  setShortcut]  = useState("");
  const [body,      setBody]      = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editShort, setEditShort] = useState("");
  const [editBody,  setEditBody]  = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res  = await fetch("/api/inbox/quick-replies");
    const json = await res.json().catch(() => null) as { ok: boolean; data: QuickReply[] } | null;
    if (json?.ok) setReplies(json.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const res  = await fetch("/api/inbox/quick-replies", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcut, body }),
    });
    const json = await res.json().catch(() => null) as { ok: boolean; error?: string } | null;
    setSaving(false);
    if (!json?.ok) { setError(json?.error ?? "Failed to save"); return; }
    setShortcut(""); setBody("");
    load();
  }

  async function update(id: string) {
    setEditError(null);
    const res  = await fetch(`/api/inbox/quick-replies/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcut: editShort, body: editBody }),
    });
    const json = await res.json().catch(() => null) as { ok: boolean; error?: string } | null;
    if (json?.ok) { setEditId(null); load(); }
    else setEditError(json?.error ?? "Failed to update");
  }

  async function remove(id: string) {
    if (!confirm("Delete this quick reply?")) return;
    await fetch(`/api/inbox/quick-replies/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="min-h-screen bg-canvas px-6 py-5 lg:px-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Quick Replies</h1>
        <p className="mt-0.5 text-sm text-ink-muted">Canned responses agents can insert with the / shortcut.</p>
      </div>

      {/* Create form */}
      <form onSubmit={create} className="mb-8 rounded-2xl border border-rule bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink">Add new quick reply</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">Shortcut</label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-ink-muted">/</span>
              <input
                type="text" required value={shortcut}
                onChange={(e) => setShortcut(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                placeholder="thanks"
                className="block w-full rounded-xl border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">Message</label>
            <input
              type="text" required value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Thank you for your order! 🎉"
              className="block w-full rounded-xl border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30"
            />
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <button type="submit" disabled={saving}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60">
          {saving ? "Saving…" : "Add quick reply"}
        </button>
      </form>

      {/* List */}
      {loading ? (
        <div className="rounded-2xl border border-rule bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule bg-canvas">
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted">Shortcut</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted">Message</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded-full bg-canvas" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-full animate-pulse rounded-full bg-canvas" /></td>
                  <td className="px-4 py-3 text-right"><div className="ml-auto h-4 w-16 animate-pulse rounded-full bg-canvas" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : replies.length === 0 ? (
        <p className="text-sm text-ink-muted">No quick replies yet.</p>
      ) : (
        <div className="rounded-2xl border border-rule bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule bg-canvas">
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted">Shortcut</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted">Message</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {replies.map((r) => (
                <tr key={r.id} className="hover:bg-canvas/60 transition">
                  {editId === r.id ? (
                    <>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-ink-muted font-bold">/</span>
                          <input value={editShort} onChange={(e) => setEditShort(e.target.value)}
                            className="w-28 rounded-lg border border-rule bg-canvas px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus/30" />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <input value={editBody} onChange={(e) => setEditBody(e.target.value)}
                          className="w-full rounded-lg border border-rule bg-canvas px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus/30" />
                      </td>
                      <td className="px-4 py-2 text-right">
                        {editError && <p className="mb-1 text-xs text-danger">{editError}</p>}
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => update(r.id)}
                            className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-dark transition">
                            Save
                          </button>
                          <button onClick={() => { setEditId(null); setEditError(null); }}
                            className="rounded-lg border border-rule px-3 py-1 text-xs font-medium text-ink-muted hover:bg-canvas transition">
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-mono text-xs text-brand font-semibold">/{r.shortcut}</td>
                      <td className="px-4 py-3 text-ink">{r.body}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => { setEditId(r.id); setEditShort(r.shortcut); setEditBody(r.body); setEditError(null); }}
                            className="rounded-lg border border-rule px-3 py-1 text-xs font-medium text-ink hover:bg-canvas transition">
                            Edit
                          </button>
                          <button onClick={() => remove(r.id)}
                            className="rounded-lg border border-danger/30 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/5 transition">
                            Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
