"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

type ConvStatus = "OPEN" | "PENDING" | "RESOLVED";

type ConvSummary = {
  id:              string;
  waId:            string;
  customerName:    string;
  status:          ConvStatus;
  botPaused:       boolean;
  tags:            string[];
  lastInboundAt:   string | null;
  unreadCount:     number;
  lastMessageAt:   string;
  lastMessageBody: string | null;
  assignedTo:      { id: string; name: string } | null;
};

type Message = {
  id:            string;
  direction:     "INBOUND" | "OUTBOUND";
  messageStatus: string | null;
  body:          string | null;
  mediaUrl:      string | null;
  mediaType:     string | null;
  createdAt:     string;
  sentBy:        { id: string; name: string } | null;
};

type Note = {
  id:        string;
  body:      string;
  createdAt: string;
  author:    { id: string; name: string } | null;
};

type QuickReply = { id: string; shortcut: string; body: string };
type Agent      = { id: string; name: string };
type Toast      = { id: string; msg: string };

type CustomerOrder = {
  id:            string;
  orderNumber:   string;
  trackingCode:  string;
  orderStatus:   string;
  paymentStatus: string;
  totalAmount:   string | null;
  deliveryDate:  string | null;
  createdAt:     string;
  branchName:    string | null;
};

type CustomerProfile = {
  id:             string | null;
  name:           string;
  phone:          string;
  email:          string | null;
  whatsappNumber: string | null;
  createdAt:      string | null;
};

// ── Predefined tags ────────────────────────────────────────────────────────

const PRESET_TAGS: { label: string; color: string; bg: string }[] = [
  { label: "Order issue",   color: "text-red-700",    bg: "bg-red-50 border-red-200" },
  { label: "Payment",       color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
  { label: "Complaint",     color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  { label: "Follow-up",     color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  { label: "New customer",  color: "text-emerald-700",bg: "bg-emerald-50 border-emerald-200" },
  { label: "VIP",           color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  { label: "Delivery",      color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  { label: "Urgent",        color: "text-rose-700",   bg: "bg-rose-50 border-rose-200" },
];

function tagStyle(label: string) {
  return PRESET_TAGS.find((t) => t.label === label) ?? { label, color: "text-gray-700", bg: "bg-gray-50 border-gray-200" };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return "now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function isSameDay(a: string, b: string) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function dayLabel(iso: string) {
  const today = new Date(), yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(iso, today.toISOString()))     return "Today";
  if (isSameDay(iso, yesterday.toISOString())) return "Yesterday";
  return new Date(iso).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

function is24hWindowClosed(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() > 24 * 60 * 60 * 1000;
}

function playPing() {
  try {
    const Ctx  = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx  = new Ctx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine"; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
  } catch { /* blocked without user gesture */ }
}

const STATUS_DOT: Record<ConvStatus, string> = {
  OPEN:     "bg-emerald-400",
  PENDING:  "bg-amber-400",
  RESOLVED: "bg-gray-300",
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  RECEIVED:         "bg-gray-100 text-gray-600",
  CONFIRMED:        "bg-gray-100 text-gray-600",
  PREPARING:        "bg-gray-100 text-gray-700",
  READY:            "bg-gray-100 text-gray-700",
  OUT_FOR_DELIVERY: "bg-gray-100 text-gray-700",
  DELIVERED:        "bg-emerald-50 text-emerald-700",
  CANCELLED:        "bg-red-50 text-red-600",
};

const PAYMENT_COLOR: Record<string, string> = {
  UNPAID:   "text-red-500",
  PARTIAL:  "text-amber-600",
  PAID:     "text-emerald-600",
  REFUNDED: "text-gray-400",
};

// ── Avatar ─────────────────────────────────────────────────────────────────

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-11 w-11 text-base" : "h-9 w-9 text-sm";
  return (
    <div className={`${sz} bg-gray-200 text-gray-700 border border-gray-300/60 flex shrink-0 items-center justify-center rounded-full font-semibold`}>
      {initials(name)}
    </div>
  );
}

// ── Delivery tick icon ─────────────────────────────────────────────────────

function DeliveryTick({ status }: { status: string | null }) {
  if (!status || status === "SENT") {
    return (
      <svg viewBox="0 0 16 11" fill="none" className="h-3 w-3 text-white/50" aria-label="Sent">
        <path d="M1 5.5L5.5 10L15 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (status === "DELIVERED") {
    return (
      <svg viewBox="0 0 20 11" fill="none" className="h-3.5 w-3 text-white/70" aria-label="Delivered">
        <path d="M1 5.5L5.5 10L15 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 5.5L10.5 10L20 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (status === "READ") {
    return (
      <svg viewBox="0 0 20 11" fill="none" className="h-3.5 w-3 text-blue-200" aria-label="Read">
        <path d="M1 5.5L5.5 10L15 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 5.5L10.5 10L20 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (status === "FAILED") {
    return (
      <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3 text-red-300" aria-label="Failed">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M6 3.5V6.5M6 8h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }
  return null;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function InboxClient({
  initialConversations,
  agents,
  currentUserId,
  templateConfigured,
}: {
  initialConversations: ConvSummary[];
  agents:               Agent[];
  currentUserId:        string;
  templateConfigured:   boolean;
}) {
  const [conversations, setConversations] = useState<ConvSummary[]>(initialConversations);
  const [statusFilter,  setStatusFilter]  = useState<"ALL" | "OPEN" | "PENDING" | "RESOLVED" | "PAUSED">("OPEN");
  const [assignFilter,  setAssignFilter]  = useState<"all" | "me" | "unassigned">("all");
  const [search,        setSearch]        = useState("");
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [notes,         setNotes]         = useState<Note[]>([]);
  const [convDetail,    setConvDetail]    = useState<ConvSummary | null>(null);
  const [loadingMsgs,   setLoadingMsgs]  = useState(false);
  const [toasts,        setToasts]        = useState<Toast[]>([]);

  // Customer panel
  const [customer,        setCustomer]        = useState<CustomerProfile | null>(null);
  const [customerOrders,  setCustomerOrders]  = useState<CustomerOrder[]>([]);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [showCustomer,    setShowCustomer]    = useState(true);

  // Reply
  const [replyText,    setReplyText]    = useState("");
  const [sending,      setSending]      = useState(false);
  const [sendError,    setSendError]    = useState<string | null>(null);
  const [uploadingMedia,   setUploadingMedia]   = useState(false);
  const [sendingTemplate,  setSendingTemplate]  = useState(false);
  const [templateError,    setTemplateError]    = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notes
  const [noteText,   setNoteText]   = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Quick replies
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [qrQuery,      setQrQuery]      = useState<string | null>(null);
  const [qrResults,    setQrResults]    = useState<QuickReply[]>([]);
  const [qrIndex,      setQrIndex]      = useState(0);

  // Tags panel
  const [showTagPicker, setShowTagPicker] = useState(false);

  const bottomRef       = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const prevConvsRef    = useRef<Map<string, ConvSummary>>(new Map());
  const selectedIdRef   = useRef<string | null>(null);
  const isFirstFetchRef = useRef(true);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // ── Toasts ────────────────────────────────────────────────────────────────
  function addToast(msg: string) {
    const id = crypto.randomUUID();
    setToasts((p) => [...p, { id, msg }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000);
  }

  // ── Poll conversation list — always fetch ALL so counts are always correct ──
  useEffect(() => {
    async function fetchConvs() {
      try {
        const qs = new URLSearchParams({ status: "ALL" });
        if (assignFilter !== "all") qs.set("assignedTo", assignFilter);
        const res  = await fetch(`/api/inbox/conversations?${qs}`);
        const json = await res.json().catch(() => null) as { ok: boolean; data: ConvSummary[] } | null;
        if (!json?.ok) return;
        const newConvs = json.data;
        if (!isFirstFetchRef.current) {
          let ping = false;
          for (const c of newConvs) {
            const prev = prevConvsRef.current.get(c.id);
            if (prev && c.unreadCount > prev.unreadCount && c.id !== selectedIdRef.current) ping = true;
            if (prev && c.assignedTo?.id === currentUserId && prev.assignedTo?.id !== currentUserId)
              addToast(`Assigned to you: ${c.customerName}`);
          }
          if (ping) playPing();
        }
        isFirstFetchRef.current = false;
        prevConvsRef.current = new Map(newConvs.map((c) => [c.id, c]));
        setConversations(newConvs);
      } catch { /* network */ }
    }
    fetchConvs();
    const t = setInterval(fetchConvs, 4000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignFilter]);

  // ── Load messages + notes ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) return;
    async function load() {
      setLoadingMsgs(true);
      try {
        const [mr, nr] = await Promise.all([
          fetch(`/api/inbox/conversations/${selectedId}`),
          fetch(`/api/inbox/conversations/${selectedId}/notes`),
        ]);
        const mj = await mr.json().catch(() => null) as { ok: boolean; data: { conversation: ConvSummary; messages: Message[] } } | null;
        const nj = await nr.json().catch(() => null) as { ok: boolean; data: Note[] } | null;
        if (mj?.ok) {
          setMessages(mj.data.messages);
          setConvDetail(mj.data.conversation);
          setConversations((p) => p.map((c) => c.id === selectedId ? { ...c, unreadCount: 0 } : c));
        }
        if (nj?.ok) setNotes(nj.data);
      } finally { setLoadingMsgs(false); }
    }
    load();
    const t = setInterval(async () => {
      try {
        const [mr, nr] = await Promise.all([
          fetch(`/api/inbox/conversations/${selectedId}`),
          fetch(`/api/inbox/conversations/${selectedId}/notes`),
        ]);
        const mj = await mr.json().catch(() => null) as { ok: boolean; data: { conversation: ConvSummary; messages: Message[] } } | null;
        const nj = await nr.json().catch(() => null) as { ok: boolean; data: Note[] } | null;
        if (mj?.ok) { setMessages(mj.data.messages); setConvDetail(mj.data.conversation); }
        if (nj?.ok) setNotes(nj.data);
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(t);
  }, [selectedId]);

  // ── Customer profile ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) return;
    setCustomer(null); setCustomerOrders([]); setLoadingCustomer(true);
    fetch(`/api/inbox/conversations/${selectedId}/customer-orders`)
      .then((r) => r.json())
      .then((j: { ok: boolean; data: { customer: CustomerProfile; orders: CustomerOrder[] } }) => {
        if (j.ok) { setCustomer(j.data.customer); setCustomerOrders(j.data.orders); }
      })
      .catch(() => {})
      .finally(() => setLoadingCustomer(false));
  }, [selectedId]);

  // ── Quick replies ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/inbox/quick-replies")
      .then((r) => r.json())
      .then((j: { ok: boolean; data: QuickReply[] }) => { if (j.ok) setQuickReplies(j.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (qrQuery === null) { setQrResults([]); return; }
    const q = qrQuery.toLowerCase();
    setQrResults(quickReplies.filter((r) => r.shortcut.includes(q) || r.body.toLowerCase().includes(q)).slice(0, 6));
    setQrIndex(0);
  }, [qrQuery, quickReplies]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Close tag picker on outside click ────────────────────────────────────
  useEffect(() => {
    if (!showTagPicker) return;
    const handler = () => setShowTagPicker(false);
    setTimeout(() => document.addEventListener("click", handler), 0);
    return () => document.removeEventListener("click", handler);
  }, [showTagPicker]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleReplyChange(val: string) {
    setReplyText(val);
    const m = val.match(/(?:^|\s)\/(\S*)$/);
    setQrQuery(m ? m[1] : null);
  }

  function insertQuickReply(qr: QuickReply) {
    setReplyText((t) => t.replace(/(?:^|\s)\/\S*$/, (m) => m.startsWith(" ") ? " " + qr.body : qr.body));
    setQrQuery(null);
    textareaRef.current?.focus();
  }

  function handleReplyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (qrQuery !== null && qrResults.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setQrIndex((i) => Math.min(i + 1, qrResults.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setQrIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertQuickReply(qrResults[qrIndex]); return; }
      if (e.key === "Escape") { setQrQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && qrQuery === null) { e.preventDefault(); void sendReply(); }
  }

  async function sendReply(e?: FormEvent) {
    e?.preventDefault();
    if (!selectedId || !replyText.trim() || sending) return;
    setSending(true); setSendError(null);
    try {
      const res  = await fetch(`/api/inbox/conversations/${selectedId}/reply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText }),
      });
      const json = await res.json().catch(() => null) as { ok: boolean; error?: string } | null;
      if (!json?.ok) { setSendError(json?.error ?? "Failed to send"); return; }
      setReplyText("");
      const r2 = await fetch(`/api/inbox/conversations/${selectedId}`);
      const j2 = await r2.json().catch(() => null) as { ok: boolean; data: { conversation: ConvSummary; messages: Message[] } } | null;
      if (j2?.ok) { setMessages(j2.data.messages); setConvDetail(j2.data.conversation); }
    } finally { setSending(false); }
  }

  async function sendMedia(file: File) {
    if (!selectedId || uploadingMedia) return;
    setUploadingMedia(true); setSendError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch(`/api/inbox/conversations/${selectedId}/reply-media`, { method: "POST", body: fd });
      const json = await res.json().catch(() => null) as { ok: boolean; error?: string } | null;
      if (!json?.ok) { setSendError(json?.error ?? "Failed to send media"); return; }
      const r2 = await fetch(`/api/inbox/conversations/${selectedId}`);
      const j2 = await r2.json().catch(() => null) as { ok: boolean; data: { conversation: ConvSummary; messages: Message[] } } | null;
      if (j2?.ok) { setMessages(j2.data.messages); setConvDetail(j2.data.conversation); }
    } finally { setUploadingMedia(false); }
  }

  async function sendTemplate() {
    if (!selectedId || sendingTemplate) return;
    setSendingTemplate(true); setTemplateError(null);
    try {
      const res  = await fetch(`/api/inbox/conversations/${selectedId}/send-template`, { method: "POST" });
      const json = await res.json().catch(() => null) as { ok: boolean; error?: string } | null;
      if (!json?.ok) { setTemplateError(json?.error ?? "Failed to send template"); return; }
      const r2 = await fetch(`/api/inbox/conversations/${selectedId}`);
      const j2 = await r2.json().catch(() => null) as { ok: boolean; data: { conversation: ConvSummary; messages: Message[] } } | null;
      if (j2?.ok) { setMessages(j2.data.messages); setConvDetail(j2.data.conversation); }
    } finally { setSendingTemplate(false); }
  }

  async function saveNote(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !noteText.trim() || savingNote) return;
    setSavingNote(true);
    try {
      const res  = await fetch(`/api/inbox/conversations/${selectedId}/notes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteText }),
      });
      const json = await res.json().catch(() => null) as { ok: boolean; data: Note } | null;
      if (json?.ok) { setNotes((p) => [...p, json.data]); setNoteText(""); }
    } finally { setSavingNote(false); }
  }

  async function patchConv(patch: { status?: ConvStatus; assignedToId?: string | null; botPaused?: boolean; tags?: string[] }) {
    if (!selectedId) return;
    await fetch(`/api/inbox/conversations/${selectedId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setConvDetail((c) => c ? { ...c, ...patch, ...(patch.status === "RESOLVED" ? { botPaused: false } : {}) } : c);
    setConversations((p) => p.map((c) => c.id === selectedId
      ? { ...c, ...patch,
          ...(patch.status === "RESOLVED" ? { botPaused: false } : {}),
          ...("assignedToId" in patch ? { assignedTo: patch.assignedToId ? (agents.find((a) => a.id === patch.assignedToId) ?? null) : null } : {}),
        }
      : c
    ));
  }

  function toggleTag(label: string) {
    const current = selected?.tags ?? [];
    const next    = current.includes(label) ? current.filter((t) => t !== label) : [...current, label];
    void patchConv({ tags: next });
  }

  function openConv(id: string) {
    setSelectedId(id);
    setMessages([]); setNotes([]); setConvDetail(null);
    setCustomer(null); setCustomerOrders([]);
    setReplyText(""); setQrQuery(null); setSendError(null);
    setShowTagPicker(false);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const selected      = convDetail ?? conversations.find((c) => c.id === selectedId) ?? null;
  const windowClosed  = is24hWindowClosed(selected?.lastInboundAt ?? null);

  const filtered = conversations.filter((c) => {
    if (statusFilter === "OPEN"     && c.status !== "OPEN")     return false;
    if (statusFilter === "PENDING"  && c.status !== "PENDING")  return false;
    if (statusFilter === "RESOLVED" && c.status !== "RESOLVED") return false;
    if (statusFilter === "PAUSED"   && !c.botPaused)            return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!c.customerName.toLowerCase().includes(q) && !c.waId.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    ALL:      conversations.length,
    OPEN:     conversations.filter((c) => c.status === "OPEN").length,
    PENDING:  conversations.filter((c) => c.status === "PENDING").length,
    RESOLVED: conversations.filter((c) => c.status === "RESOLVED").length,
    PAUSED:   conversations.filter((c) => c.botPaused).length,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex overflow-hidden bg-[#f7f8fa]" style={{ height: "calc(100vh - 64px)" }}>

      {/* ── Toast stack ── */}
      <div className="fixed right-5 top-20 z-50 flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-xl shadow-black/5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4 text-brand"><path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <p className="text-sm font-medium text-gray-800">{t.msg}</p>
            <button onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="ml-auto text-gray-400 hover:text-gray-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════
          LEFT — Conversation list
      ════════════════════════════════════════════════════════════ */}
      <div className="flex w-[300px] shrink-0 flex-col border-r border-gray-200 bg-white">

        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-bold text-gray-900">Inbox</h2>
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
            {conversations.filter((c) => c.unreadCount > 0).length > 0
              ? `${conversations.filter((c) => c.unreadCount > 0).length} unread`
              : `${conversations.length} chats`}
          </span>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* Assign filter */}
        <div className="flex gap-1 px-4 pb-3">
          {([["all","All"],["me","Mine"],["unassigned","Unassigned"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setAssignFilter(v)}
              className={["flex-1 rounded-lg py-1.5 text-xs font-semibold transition",
                assignFilter === v ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100",
              ].join(" ")}>
              {l}
            </button>
          ))}
        </div>

        {/* Status filter — compact chips */}
        <div className="border-t border-gray-100 px-4 py-2.5 flex flex-wrap gap-1.5">
          {([
            ["ALL",      "All",     "bg-gray-400"],
            ["OPEN",     "Open",    "bg-emerald-400"],
            ["PENDING",  "Pending", "bg-amber-400"],
            ["RESOLVED", "Resolved","bg-gray-300"],
            ["PAUSED",   "Paused",  "bg-orange-400"],
          ] as const).map(([v, l, dot]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={["flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition",
                statusFilter === v
                  ? "bg-gray-900 text-white font-semibold"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200",
              ].join(" ")}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusFilter === v ? "bg-white/70" : dot}`} />
              {l}
              <span className={["text-[10px] font-bold", statusFilter === v ? "text-white/70" : "text-gray-400"].join(" ")}>
                {counts[v]}
              </span>
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto border-t border-gray-100">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-gray-400"><path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              </div>
              <p className="text-sm text-gray-400">{search ? "No results found" : "No conversations"}</p>
            </div>
          )}
          {filtered.map((c) => (
            <button key={c.id} onClick={() => openConv(c.id)}
              className={["w-full border-b border-gray-100 px-4 py-3.5 text-left transition-colors",
                selectedId === c.id
                  ? "bg-brand/5 border-l-[3px] border-l-brand"
                  : "hover:bg-gray-50 border-l-[3px] border-l-transparent",
              ].join(" ")}>
              <div className="flex items-start gap-3">
                <div className="relative shrink-0 mt-0.5">
                  <Avatar name={c.customerName} size="sm" />
                  <span className={["absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white", STATUS_DOT[c.status]].join(" ")} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={["truncate text-sm", c.unreadCount > 0 ? "font-bold text-gray-900" : "font-medium text-gray-700"].join(" ")}>
                      {c.customerName}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {c.unreadCount > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                          {c.unreadCount}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400">{timeAgo(c.lastMessageAt)}</span>
                    </div>
                  </div>
                  <p className={["mt-0.5 truncate text-xs", c.unreadCount > 0 ? "text-gray-600" : "text-gray-400"].join(" ")}>
                    {c.lastMessageBody ?? "Attachment"}
                  </p>
                  {(c.tags.length > 0 || c.botPaused) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {c.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500">
                          {tag}
                        </span>
                      ))}
                      {c.botPaused && (
                        <span className="flex shrink-0 items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2.5 w-2.5"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                          Bot paused
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          CENTER — Chat
      ════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 flex-col min-w-0">
        {!selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-sm border border-gray-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} className="h-9 w-9 text-gray-300"><path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-600">Select a conversation</p>
              <p className="mt-1 text-xs text-gray-400">Choose from the list to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={selected?.customerName ?? "?"} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-gray-900">{selected?.customerName ?? "—"}</p>
                      {selected?.botPaused && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2.5 w-2.5"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                          Bot paused
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{selected?.waId}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* Tag picker */}
                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setShowTagPicker((v) => !v); }}
                      className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/></svg>
                      Tags {selected?.tags && selected.tags.length > 0 && <span className="ml-0.5 rounded-full bg-brand/10 px-1.5 text-brand">{selected.tags.length}</span>}
                    </button>
                    {showTagPicker && (
                      <div onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-10 z-40 w-60 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-black/10">
                        <p className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Label this conversation</p>
                        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                          {PRESET_TAGS.map(({ label, color, bg }) => {
                            const active = selected?.tags?.includes(label);
                            return (
                              <button key={label} onClick={() => toggleTag(label)}
                                className={["rounded-lg border px-2.5 py-1 text-xs font-semibold transition", bg, color,
                                  active ? "ring-2 ring-offset-1 ring-current/30 opacity-100" : "opacity-70 hover:opacity-100",
                                ].join(" ")}>
                                {active && "✓ "}{label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bot toggle */}
                  <button onClick={() => patchConv({ botPaused: !selected?.botPaused })}
                    className={["flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                      selected?.botPaused
                        ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                    ].join(" ")}>
                    {selected?.botPaused ? (
                      <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>Resume bot</>
                    ) : (
                      <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>Pause bot</>
                    )}
                  </button>

                  {/* Assign */}
                  <select value={selected?.assignedTo?.id ?? ""}
                    onChange={(e) => patchConv({ assignedToId: e.target.value || null })}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer transition">
                    <option value="">Unassigned</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>

                  {/* Status */}
                  <select value={selected?.status ?? "OPEN"}
                    onChange={(e) => patchConv({ status: e.target.value as ConvStatus })}
                    className={["rounded-xl border-0 px-3 py-1.5 text-xs font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/20 transition",
                      selected?.status === "OPEN"    ? "bg-emerald-100 text-emerald-700" :
                      selected?.status === "PENDING" ? "bg-amber-100 text-amber-700" :
                                                       "bg-gray-100 text-gray-500",
                    ].join(" ")}>
                    <option value="OPEN">Open</option>
                    <option value="PENDING">Pending</option>
                    <option value="RESOLVED">Resolved</option>
                  </select>

                  {/* Customer panel */}
                  <button onClick={() => setShowCustomer((v) => !v)}
                    className={["flex h-8 w-8 items-center justify-center rounded-xl border transition",
                      showCustomer ? "border-brand/30 bg-brand/5 text-brand" : "border-gray-200 text-gray-400 hover:bg-gray-50",
                    ].join(" ")} title="Customer details">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  </button>
                </div>
              </div>

              {/* Tags row */}
              {selected?.tags && selected.tags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {selected.tags.map((tag) => {
                    const s = tagStyle(tag);
                    return (
                      <span key={tag} className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold ${s.bg} ${s.color}`}>
                        {tag}
                        <button onClick={() => toggleTag(tag)} className="opacity-50 hover:opacity-100">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2.5 w-2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Bot paused info bar */}
              {selected?.botPaused && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3.5 py-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 text-amber-500"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  <p className="text-xs text-amber-700">
                    <span className="font-semibold">You are handling this conversation.</span>
                    {" "}The bot will not respond until you resolve it or manually resume it.
                  </p>
                </div>
              )}

              {/* 24h window closed banner */}
              {windowClosed && (
                <div className="mt-2 rounded-xl bg-red-50 border border-red-100 px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 text-red-500"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 6v6l4 2"/></svg>
                    <p className="text-xs text-red-700">
                      <span className="font-semibold">24-hour window closed.</span>
                      {" "}Free-text replies may not deliver. Send a template to re-open the conversation.
                    </p>
                  </div>
                  {templateError && <p className="mt-1.5 text-[11px] text-red-600">{templateError}</p>}
                  {templateConfigured ? (
                    <button onClick={() => void sendTemplate()} disabled={sendingTemplate}
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50">
                      {sendingTemplate ? (
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      )}
                      {sendingTemplate ? "Sending…" : "Send re-engagement message"}
                    </button>
                  ) : (
                    <p className="mt-2 text-[11px] text-red-500">
                      No re-engagement template configured. Go to <strong>WA → Settings</strong> to set one.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Chat messages ── */}
            <>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-1">
                  {loadingMsgs && messages.length === 0 && (
                    <div className="flex items-center justify-center py-16">
                      <svg className="h-5 w-5 animate-spin text-gray-300" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    </div>
                  )}
                  {messages.map((m, i) => {
                    const isOut   = m.direction === "OUTBOUND";
                    const showSep = i === 0 || !isSameDay(messages[i - 1].createdAt, m.createdAt);
                    const showAvatar = !isOut && (i === messages.length - 1 || messages[i + 1]?.direction !== "INBOUND");
                    return (
                      <Fragment key={m.id}>
                        {showSep && (
                          <div className="flex items-center gap-3 py-3">
                            <div className="h-px flex-1 bg-gray-200" />
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium text-gray-500">
                              {dayLabel(m.createdAt)}
                            </span>
                            <div className="h-px flex-1 bg-gray-200" />
                          </div>
                        )}
                        <div className={["flex items-end gap-2 mb-0.5", isOut ? "justify-end" : "justify-start"].join(" ")}>
                          {!isOut && (
                            <div className="w-8 shrink-0">
                              {showAvatar && <Avatar name={selected?.customerName ?? "?"} size="sm" />}
                            </div>
                          )}
                          <div className={["max-w-[65%] flex flex-col gap-0.5", isOut ? "items-end" : "items-start"].join(" ")}>
                            {isOut && m.sentBy && (
                              <span className="text-[10px] text-gray-400 mr-1">{m.sentBy.name}</span>
                            )}
                            <div className={["rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                              isOut
                                ? "rounded-br-md bg-brand text-white"
                                : "rounded-bl-md bg-white text-gray-800 border border-gray-100",
                            ].join(" ")}>
                              {m.mediaUrl ? (
                                <a href={m.mediaUrl} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-2 underline underline-offset-2">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                                  {m.mediaType ?? "Attachment"}
                                  {m.body && <span className="ml-1 opacity-80">{m.body}</span>}
                                </a>
                              ) : (
                                <p className="whitespace-pre-wrap">{m.body}</p>
                              )}
                            </div>
                            <div className={["flex items-center gap-1.5 px-1", isOut ? "flex-row-reverse" : ""].join(" ")}>
                              <span className="text-[10px] text-gray-400">{fmtTime(m.createdAt)}</span>
                              {isOut && <DeliveryTick status={m.messageStatus} />}
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* ── Reply box ── */}
                <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4">
                  {sendError && (
                    <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{sendError}</p>
                  )}
                  {qrQuery !== null && qrResults.length > 0 && (
                    <div className="mb-3 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-black/5">
                      {qrResults.map((qr, i) => (
                        <button key={qr.id} type="button" onClick={() => insertQuickReply(qr)}
                          className={["flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                            i === qrIndex ? "bg-brand/5" : "hover:bg-gray-50",
                          ].join(" ")}>
                          <span className="shrink-0 rounded-md bg-brand/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-brand">/{qr.shortcut}</span>
                          <span className="truncate text-sm text-gray-600">{qr.body}</span>
                        </button>
                      ))}
                      <p className="border-t border-gray-100 px-4 py-2 text-[10px] text-gray-400">
                        ↑↓ navigate · Enter/Tab select · Esc close
                      </p>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    {/* Attach file */}
                    <input ref={fileInputRef} type="file" className="hidden"
                      accept="image/*,video/*,audio/*,application/pdf"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) sendMedia(f); e.target.value = ""; }}
                    />
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingMedia}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-400 transition hover:bg-gray-50 hover:text-gray-600 disabled:opacity-40"
                      title="Send image or file">
                      {uploadingMedia ? (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                      )}
                    </button>

                    <textarea ref={textareaRef} rows={2} value={replyText}
                      onChange={(e) => handleReplyChange(e.target.value)}
                      onKeyDown={handleReplyKeyDown}
                      placeholder="Type a message… Use / for quick replies"
                      className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 transition"
                    />
                    <button type="button" onClick={() => void sendReply()} disabled={sending || !replyText.trim()}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                      {sending ? (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      )}
                    </button>
                  </div>
                </div>
              </>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          RIGHT — Customer panel
      ════════════════════════════════════════════════════════════ */}
      {selectedId && showCustomer && (
        <div className="flex w-[280px] shrink-0 flex-col border-l border-gray-200 bg-white overflow-y-auto">
          <div className="px-5 py-5 border-b border-gray-100">
            <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">Contact</p>
            {loadingCustomer ? (
              <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-4 rounded-lg bg-gray-100 animate-pulse" />)}</div>
            ) : customer ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar name={customer.name} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{customer.name}</p>
                    <p className="text-[11px] text-gray-400">{customer.id ? "Existing customer" : "New contact"}</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {[
                    { icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>, text: customer.phone },
                    customer.email ? { icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>, text: customer.email } : null,
                    customer.createdAt ? { icon: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>, text: `Since ${fmtDate(customer.createdAt)}` } : null,
                  ].filter(Boolean).map((row, i) => row && (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 text-gray-500">{row.icon}</svg>
                      </div>
                      <span className="truncate text-sm text-gray-700">{row.text}</span>
                    </div>
                  ))}
                </div>
                {customer.id && (
                  <a href={`/customers?q=${encodeURIComponent(customer.phone)}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-brand/30 hover:bg-brand/5 hover:text-brand">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                    View full profile
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No customer info found.</p>
            )}
          </div>

          {/* Orders — only shown when orders exist */}
          {(loadingCustomer || customerOrders.length > 0) && (
            <div className="px-5 py-5 border-b border-gray-100">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Orders</p>
                {customerOrders.length > 0 && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{customerOrders.length}</span>
                )}
              </div>
              {loadingCustomer ? (
                <div className="space-y-3">{[1,2].map((i) => <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
              ) : (
                <div className="space-y-2.5">
                  {customerOrders.map((o) => (
                    <a key={o.id} href={`/orders/${o.trackingCode}`} target="_blank" rel="noreferrer"
                      className="block rounded-2xl border border-gray-100 bg-gray-50/60 p-3.5 transition hover:border-brand/20 hover:bg-brand/5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-sm font-bold text-gray-900">#{o.orderNumber}</span>
                        <span className={["rounded-full px-2 py-0.5 text-[10px] font-bold", ORDER_STATUS_COLOR[o.orderStatus] ?? "bg-gray-100 text-gray-600"].join(" ")}>
                          {o.orderStatus.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={["text-xs font-semibold", PAYMENT_COLOR[o.paymentStatus] ?? "text-gray-400"].join(" ")}>{o.paymentStatus}</span>
                        {o.totalAmount && <span className="text-sm font-bold text-gray-800">AED {Number(o.totalAmount).toFixed(0)}</span>}
                      </div>
                      {(o.deliveryDate || o.branchName) && (
                        <p className="mt-1.5 text-[11px] text-gray-400">
                          {o.deliveryDate ? fmtDate(o.deliveryDate) : ""}{o.branchName ? ` · ${o.branchName}` : ""}
                        </p>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="flex flex-1 flex-col px-5 py-5 min-h-0">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Internal Notes{notes.length > 0 ? ` (${notes.length})` : ""}
            </p>
            <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0">
              {notes.length === 0 && !loadingMsgs && (
                <p className="text-xs text-gray-400">No notes yet.</p>
              )}
              {notes.map((n) => (
                <div key={n.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700">{n.body}</p>
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-gray-400">
                    <span className="font-medium text-gray-500">{n.author?.name ?? "Unknown"}</span>
                    <span>·</span>
                    <span>{fmtTime(n.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={saveNote} className="mt-3 flex flex-col gap-2">
              <textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note…"
                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-200 transition"
              />
              <button type="submit" disabled={savingNote || !noteText.trim()}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">
                {savingNote ? (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                )}
                Save note
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
