"use client";

import React, { Fragment, useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import ProductPicker from "./ProductPicker";
import VoiceRecorder from "./VoiceRecorder";
import { useSSE, type SSEPayload } from "@/hooks/useSSE";

// ── Types ──────────────────────────────────────────────────────────────────

type ConvStatus = "OPEN" | "PENDING" | "RESOLVED";

type ConvSummary = {
  id:              string;
  waId:            string;
  customerName:    string;
  channel:         string;
  status:          ConvStatus;
  botPaused:       boolean;
  agentRequested:  boolean;
  tags:            string[];
  lastInboundAt:   string | null;
  unreadCount:     number;
  lastMessageAt:   string;
  lastMessageBody: string | null;
  assignedTo:      { id: string; name: string } | null;
  broadcastOptOut:  boolean;
  broadcastOptOutAt: string | null;
  // Bot context (populated by bot via webhook)
  currentBotFlowId?:      number | null;
  currentBotFlowName?:    string | null;
  currentBotStepKey?:     string | null;
  botContextVariables?:   string | null;
  lastBotActivityAt?:     string | null;
};

type Message = {
  id:            string;
  direction:     "INBOUND" | "OUTBOUND";
  messageStatus: string | null;
  body:          string | null;
  mediaUrl:      string | null;
  mediaType:     string | null;
  metadata:      string | null;
  createdAt:     string;
  sentBy:        { id: string; name: string } | null;
};

type Note = {
  id:        string;
  body:      string;
  createdAt: string;
  author:    { id: string; name: string } | null;
};

type ConversationEvent = {
  id:        string;
  type:      string;
  actorName: string;
  meta:      string | null;
  createdAt: string;
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
  { label: "Delivery",      color: "text-blue-700", bg: "bg-blue-50 border-indigo-200" },
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

// ── Delivery tick icon + label ──────────────────────────────────────────────

function DeliveryTick({ status }: { status: string | null }) {
  if (!status || status === "SENT") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-[#667781]" aria-label="Sent">
        <svg viewBox="0 0 16 11" fill="none" className="h-3 w-3" aria-hidden="true">
          <path d="M1 5.5L5.5 10L15 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Sent
      </span>
    );
  }
  if (status === "DELIVERED") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-[#667781]" aria-label="Delivered">
        <svg viewBox="0 0 20 11" fill="none" className="h-3 w-3.5" aria-hidden="true">
          <path d="M1 5.5L5.5 10L15 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M6 5.5L10.5 10L20 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Delivered
      </span>
    );
  }
  if (status === "READ") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-[#53bdeb] font-medium" aria-label="Read">
        <svg viewBox="0 0 20 11" fill="none" className="h-3 w-3.5" aria-hidden="true">
          <path d="M1 5.5L5.5 10L15 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M6 5.5L10.5 10L20 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Read
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-red-500 font-medium" aria-label="Failed to deliver">
        <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3" aria-hidden="true">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M6 3.5V6.5M6 8h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Failed
      </span>
    );
  }
  return null;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function InboxClient({
  initialConversations,
  agents,
  currentUserId,
  isSuperAdmin,
  templateConfigured,
  wcConfigured,
  igConfigured,
  ccConfigured,
}: {
  initialConversations: ConvSummary[];
  agents:               Agent[];
  currentUserId:        string;
  isSuperAdmin:         boolean;
  templateConfigured:   boolean;
  wcConfigured:         boolean;
  igConfigured:         boolean;
  ccConfigured:         boolean;
}) {
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<ConvSummary[]>(initialConversations);
  const [activeChannel, setActiveChannel] = useState<"whatsapp" | "instagram">("whatsapp");
  const [igSyncing,          setIgSyncing]          = useState(false);
  const [igRefreshingNames,  setIgRefreshingNames]  = useState(false);
  const [igBotEnabled, setIgBotEnabled] = useState(true);
  const [view,          setView]          = useState<"unassigned" | "mine" | "all" | "open" | "resolved" | "paused">("all");
  const [search,        setSearch]        = useState("");
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const openWaId = searchParams.get("waId");
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [events,        setEvents]        = useState<ConversationEvent[]>([]);
  const [notes,         setNotes]         = useState<Note[]>([]);
  const [convDetail,    setConvDetail]    = useState<ConvSummary | null>(null);
  const [loadingMsgs,   setLoadingMsgs]  = useState(false);
  const [toasts,        setToasts]        = useState<Toast[]>([]);

  // Customer panel
  const [customer,        setCustomer]        = useState<CustomerProfile | null>(null);
  const [customerOrders,  setCustomerOrders]  = useState<CustomerOrder[]>([]);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [rightTab,        setRightTab]        = useState<"contact" | "bot">("contact");

  // Reply / note input tabs
  const [replyTab,     setReplyTab]     = useState<"reply" | "note">("reply");
  const [replyText,    setReplyText]    = useState("");
  const [sending,      setSending]      = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [sendError,    setSendError]    = useState<string | null>(null);
  const [uploadingMedia,   setUploadingMedia]   = useState(false);
  const [sendingTemplate,  setSendingTemplate]  = useState(false);
  const [templateError,    setTemplateError]    = useState<string | null>(null);
  const [pendingMedia,     setPendingMedia]     = useState<{ file: File; previewUrl: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notes
  const [noteText,   setNoteText]   = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Payment link modal
  const [showPayModal,    setShowPayModal]    = useState(false);
  const [payAmount,       setPayAmount]       = useState("");
  const [payCurrency,     setPayCurrency]     = useState("AED");
  const [payDesc,         setPayDesc]         = useState("");
  const [payEmail,        setPayEmail]        = useState("");
  const [payMobile,       setPayMobile]       = useState("");
  const [payDeliveryEmail, setPayDeliveryEmail] = useState(false);
  const [payDeliverySms,   setPayDeliverySms]   = useState(false);
  const [payValidFor,     setPayValidFor]     = useState(10);
  const [payTerms,        setPayTerms]        = useState("");
  const [sendingPay,      setSendingPay]      = useState(false);
  const [payError,        setPayError]        = useState<string | null>(null);
  const [paySuccess,      setPaySuccess]      = useState<string | null>(null);

  // Voice recorder overlay
  const [showVoice,  setShowVoice]  = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);

  // Quick replies
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [qrQuery,      setQrQuery]      = useState<string | null>(null);
  const [qrResults,    setQrResults]    = useState<QuickReply[]>([]);
  const [qrIndex,      setQrIndex]      = useState(0);

  // Tags panel
  const [showTagPicker, setShowTagPicker] = useState(false);

  // Image lightbox
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Story mention lightbox
  const [storyLightboxUrl,      setStoryLightboxUrl]      = useState<string | null>(null);
  const [storyLightboxMediaType, setStoryLightboxMediaType] = useState<"img" | "video">("img");

  // Scroll-to-bottom button
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const bottomRef       = useRef<HTMLDivElement>(null);
  const scrollRef       = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const prevConvsRef    = useRef<Map<string, ConvSummary>>(new Map());
  const selectedIdRef   = useRef<string | null>(null);
  const isFirstFetchRef = useRef(true);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // ── Auto-select conversation from ?waId= URL param ────────────────────────
  useEffect(() => {
    if (!openWaId || selectedId) return;
    // Try the already-loaded list first (instant)
    const norm = openWaId.replace(/^\+/, "");
    const match = conversations.find((c) => c.waId === norm || c.waId === openWaId);
    if (match) { setSelectedId(match.id); return; }
    // Not in current list — fetch it directly by waId
    fetch(`/api/inbox/conversations?waId=${encodeURIComponent(norm)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok: boolean; data: ConvSummary[] }) => {
        const conv = j.ok && j.data?.[0];
        if (!conv) return;
        setConversations((prev) => prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]);
        setSelectedId(conv.id);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWaId]);

  // ── Toasts ────────────────────────────────────────────────────────────────
  function addToast(msg: string) {
    const id = crypto.randomUUID();
    setToasts((p) => [...p, { id, msg }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000);
  }

  // ── Fetch conversation list ───────────────────────────────────────────────
  const fetchConvs = useCallback(async () => {
    try {
      const res  = await fetch(`/api/inbox/conversations?status=ALL&botPaused=all&channel=all`, { cache: "no-store" });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // ── Fetch messages for selected conversation ──────────────────────────────
  const fetchMsgs = useCallback(async () => {
    const id = selectedIdRef.current;
    if (!id) return;
    try {
      const [mr, nr] = await Promise.all([
        fetch(`/api/inbox/conversations/${id}`, { cache: "no-store" }),
        fetch(`/api/inbox/conversations/${id}/notes`, { cache: "no-store" }),
      ]);
      const mj = await mr.json().catch(() => null) as { ok: boolean; data: { conversation: ConvSummary; messages: Message[]; events: ConversationEvent[] } } | null;
      const nj = await nr.json().catch(() => null) as { ok: boolean; data: Note[] } | null;
      if (mj?.ok) { setMessages(mj.data.messages); setEvents(mj.data.events ?? []); setConvDetail(mj.data.conversation); }
      if (nj?.ok) setNotes(nj.data);
    } catch { /* ignore */ }
  }, []);

  // ── SSE — real-time updates replace all polling ───────────────────────────
  useSSE(useCallback((payload: SSEPayload) => {
    if (payload.type === "message_new" || payload.type === "conv_updated" || payload.type === "conv_new") {
      fetchConvs();
      // If the event is for the open conversation, also refresh messages
      if (payload.conversationId && payload.conversationId === selectedIdRef.current) {
        fetchMsgs();
      }
    }
    if (payload.type === "message_status" && payload.conversationId === selectedIdRef.current) {
      fetchMsgs();
    }
  }, [fetchConvs, fetchMsgs]));

  // Initial load + fallback 60s poll (keeps things fresh if SSE misses an event)
  useEffect(() => {
    fetchConvs();
    const t = setInterval(fetchConvs, 60_000);
    function onVisible() { if (document.visibilityState === "visible") fetchConvs(); }
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [fetchConvs]);

  // ── Load Instagram bot enabled setting ───────────────────────────────────
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((j) => { if (j.data?.instagram_bot_enabled !== undefined) setIgBotEnabled(j.data.instagram_bot_enabled === true); })
      .catch(() => {});
  }, []);

  // ── Load messages + notes when conversation changes ───────────────────────
  useEffect(() => {
    if (!selectedId) return;
    async function loadMsgs() {
      setLoadingMsgs(true);
      try {
        const [mr, nr] = await Promise.all([
          fetch(`/api/inbox/conversations/${selectedId}`, { cache: "no-store" }),
          fetch(`/api/inbox/conversations/${selectedId}/notes`, { cache: "no-store" }),
        ]);
        const mj = await mr.json().catch(() => null) as { ok: boolean; data: { conversation: ConvSummary; messages: Message[]; events: ConversationEvent[] } } | null;
        const nj = await nr.json().catch(() => null) as { ok: boolean; data: Note[] } | null;
        if (mj?.ok) {
          setMessages(mj.data.messages);
          setEvents(mj.data.events ?? []);
          setConvDetail(mj.data.conversation);
          setConversations((p) => p.map((c) => c.id === selectedId ? { ...c, unreadCount: 0 } : c));
        }
        if (nj?.ok) setNotes(nj.data);
      } finally { setLoadingMsgs(false); }
    }
    loadMsgs();
    // SSE handles real-time updates; keep a slow fallback poll (30s) for resilience
    const t = setInterval(fetchMsgs, 30_000);
    return () => clearInterval(t);
  }, [selectedId, fetchMsgs]);

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

  // ── Auto-scroll — only when near bottom or conversation switches ─────────
  const isNearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const prevSelectedId = useRef<string | null>(null);

  // Track scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [selectedId]);

  // Scroll to bottom after messages render — instant on conversation switch, smooth on poll update
  useEffect(() => {
    if (!messages.length) return;
    const isNewConv = prevSelectedId.current !== selectedId;
    prevSelectedId.current = selectedId;
    if (isNewConv) {
      // Defer one frame so the DOM has painted the messages
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "instant" });
      });
    } else if (isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close lightboxes on Escape ───────────────────────────────────────────
  useEffect(() => {
    if (lightboxIdx === null && storyLightboxUrl === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setLightboxIdx(null); setStoryLightboxUrl(null); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [lightboxIdx, storyLightboxUrl]);

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
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 128) + "px"; }
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

  async function refreshIgNames() {
    if (igRefreshingNames) return;
    setIgRefreshingNames(true);
    try {
      const res = await fetch("/api/instagram/refresh-names", { method: "POST" });
      const j   = await res.json() as { ok: boolean; checked?: number; updated?: number; error?: string };
      if (j.ok) {
        addToast(`Updated ${j.updated ?? 0} of ${j.checked ?? 0} Instagram names`);
        // Reload conversations to show new names
        const r = await fetch(`/api/inbox/conversations?status=ALL&botPaused=all&channel=all`, { cache: "no-store" });
        const d = await r.json() as { ok: boolean; data: ConvSummary[] };
        if (d.ok) setConversations(d.data);
      } else {
        addToast(j.error ?? "Name refresh failed");
      }
    } catch { addToast("Name refresh failed"); }
    setIgRefreshingNames(false);
  }

  async function syncInstagram() {
    if (igSyncing) return;
    setIgSyncing(true);
    try {
      const res = await fetch("/api/instagram/sync", { method: "POST" });
      const j = await res.json() as { ok: boolean; imported?: number; error?: string; needsAppReview?: boolean };
      if (j.ok) {
        const r = await fetch(`/api/inbox/conversations?status=ALL&botPaused=all&channel=all`, { cache: "no-store" });
        const d = await r.json() as { ok: boolean; data: ConvSummary[] };
        if (d.ok) setConversations(d.data);
        addToast(`Synced ${j.imported ?? 0} Instagram conversation(s)`);
      } else if (j.needsAppReview) {
        addToast("Instagram history needs Meta App Review. New messages arrive automatically via webhook.");
      } else {
        addToast(j.error ?? "Sync failed");
      }
    } finally {
      setIgSyncing(false);
    }
  }

  async function toggleIgBot() {
    const next = !igBotEnabled;
    setIgBotEnabled(next);
    try {
      const res  = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "instagram_bot_enabled", value: String(next) }),
      });
      const json = await res.json().catch(() => null) as { ok: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setIgBotEnabled(!next); // revert
        addToast(json?.error ?? "Failed to save bot setting");
      }
    } catch {
      setIgBotEnabled(!next);
      addToast("Failed to save bot setting");
    }
  }

  async function sendReply(e?: FormEvent) {
    e?.preventDefault();
    if (!selectedId || !replyText.trim() || sending) return;
    setSending(true); setSendError(null);
    const isIg   = isIgSelected;
    const replyUrl = isIg
      ? `/api/instagram/conversations/${selectedId}/reply`
      : `/api/inbox/conversations/${selectedId}/reply`;
    try {
      const res  = await fetch(replyUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText }),
      });
      const json = await res.json().catch(() => null) as { ok: boolean; error?: string } | null;
      if (!json?.ok) { setSendError(json?.error ?? "Failed to send"); return; }
      setReplyText("");
      if (textareaRef.current) textareaRef.current.style.height = "38px";
      const r2 = await fetch(`/api/inbox/conversations/${selectedId}`);
      const j2 = await r2.json().catch(() => null) as { ok: boolean; data: { conversation: ConvSummary; messages: Message[] } } | null;
      if (j2?.ok) { setMessages(j2.data.messages); setConvDetail(j2.data.conversation); }
    } finally { setSending(false); }
  }

  async function sendPaymentLink(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || sendingPay) return;
    if (!payDeliveryEmail && !payDeliverySms) {
      setPayError("Please select at least one delivery method (Email or SMS).");
      return;
    }
    setSendingPay(true);
    setPayError(null); setPaySuccess(null);
    try {
      const deliveryType = payDeliveryEmail && payDeliverySms ? "B" : payDeliveryEmail ? "E" : "S";
      const res  = await fetch(`/api/inbox/conversations/${selectedId}/payment-link`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount:              payAmount.trim(),
          currency:            payCurrency,
          description:         payDesc.trim(),
          deliveryType,
          customerEmail:       payEmail.trim(),
          customerMobile:      payMobile.trim(),
          validFor:            payValidFor,
          termsAndConditions:  payTerms.trim(),
        }),
      });
      const json = await res.json().catch(() => null) as { ok: boolean; error?: string; data?: { invoiceId: string } } | null;
      if (!json?.ok) { setPayError(json?.error ?? "Failed to send payment link"); return; }
      setPaySuccess(`Invoice sent! CCAvenue Invoice ID: ${json.data?.invoiceId ?? ""}`);
      // Refresh messages after short delay so agent sees the WA message
      setTimeout(async () => {
        const r2 = await fetch(`/api/inbox/conversations/${selectedId}`);
        const j2 = await r2.json().catch(() => null) as { ok: boolean; data: { conversation: ConvSummary; messages: Message[] } } | null;
        if (j2?.ok) { setMessages(j2.data.messages); setConvDetail(j2.data.conversation); }
      }, 800);
    } finally { setSendingPay(false); }
  }

  function resetPayModal() {
    setShowPayModal(false);
    setPayAmount(""); setPayDesc(""); setPayEmail(""); setPayMobile("");
    setPayDeliveryEmail(false); setPayDeliverySms(false);
    setPayValidFor(10); setPayTerms("");
    setPayError(null); setPaySuccess(null);
  }

  function stageMedia(files: FileList | File[]) {
    const added = Array.from(files).map((file) => ({
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    }));
    setPendingMedia((p) => [...p, ...added]);
  }

  function removePendingMedia(idx: number) {
    setPendingMedia((p) => {
      const item = p[idx];
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return p.filter((_, i) => i !== idx);
    });
  }

  async function sendMedia() {
    if (!selectedId || uploadingMedia || pendingMedia.length === 0) return;
    setUploadingMedia(true); setSendError(null);
    try {
      const caption = replyText.trim();
      // Send each file sequentially; attach caption only to the last one
      for (let i = 0; i < pendingMedia.length; i++) {
        const item = pendingMedia[i];
        const fd = new FormData();
        fd.append("file", item.file);
        if (caption && i === pendingMedia.length - 1) fd.append("caption", caption);
        const res  = await fetch(`/api/inbox/conversations/${selectedId}/reply-media`, { method: "POST", body: fd });
        const json = await res.json().catch(() => null) as { ok: boolean; error?: string } | null;
        if (!json?.ok) { setSendError(json?.error ?? "Failed to send media"); return; }
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      setPendingMedia([]);
      setReplyText("");
      if (textareaRef.current) textareaRef.current.style.height = "38px";
      const r2 = await fetch(`/api/inbox/conversations/${selectedId}`);
      const j2 = await r2.json().catch(() => null) as { ok: boolean; data: { conversation: ConvSummary; messages: Message[] } } | null;
      if (j2?.ok) { setMessages(j2.data.messages); setConvDetail(j2.data.conversation); }
    } finally { setUploadingMedia(false); }
  }

  async function sendVoice(blob: Blob) {
    if (!selectedId || sendingVoice) return;
    setSendingVoice(true); setSendError(null);
    try {
      const ext  = blob.type.includes("ogg") ? "ogg" : "webm";
      const fd   = new FormData();
      fd.append("file", blob, `voice-message.${ext}`);
      const res  = await fetch(`/api/inbox/conversations/${selectedId}/reply-media`, { method: "POST", body: fd });
      const json = await res.json().catch(() => null) as { ok: boolean; error?: string } | null;
      if (!json?.ok) { setSendError(json?.error ?? "Failed to send"); setSendingVoice(false); return; }
      setShowVoice(false);
      const r2 = await fetch(`/api/inbox/conversations/${selectedId}`);
      const j2 = await r2.json().catch(() => null) as { ok: boolean; data: { conversation: ConvSummary; messages: Message[] } } | null;
      if (j2?.ok) { setMessages(j2.data.messages); setConvDetail(j2.data.conversation); }
    } finally { setSendingVoice(false); }
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

  async function deleteConv() {
    if (!selectedId || !window.confirm("Delete this conversation and all its messages? This cannot be undone.")) return;
    await fetch(`/api/inbox/conversations/${selectedId}`, { method: "DELETE" });
    setConversations((p) => p.filter((c) => c.id !== selectedId));
    setSelectedId(null);
    setMessages([]);
    setEvents([]);
    setConvDetail(null);
  }

  async function patchConv(patch: { status?: ConvStatus; assignedToId?: string | null; botPaused?: boolean; agentRequested?: boolean; tags?: string[] }) {
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
    setMessages([]); setEvents([]); setNotes([]); setConvDetail(null);
    setCustomer(null); setCustomerOrders([]);
    setReplyText(""); setQrQuery(null); setSendError(null);
    if (textareaRef.current) textareaRef.current.style.height = "38px";
    setShowTagPicker(false); setReplyTab("reply");
    setShowVoice(false);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const selected      = convDetail ?? conversations.find((c) => c.id === selectedId) ?? null;
  const windowClosed  = is24hWindowClosed(selected?.lastInboundAt ?? null);
  // Detect Instagram by channel field OR waId prefix (for legacy rows created before channel was set)
  const isIgSelected  = selected?.channel === "instagram" || (selected?.waId?.startsWith("ig_") ?? false);

  // All image URLs in current conversation (for lightbox navigation)
  const convImages = messages
    .filter((m) => m.mediaType === "image" && m.mediaUrl)
    .map((m) => m.mediaUrl as string);

  function openLightbox(url: string) {
    const idx = convImages.indexOf(url);
    setLightboxIdx(idx >= 0 ? idx : 0);
  }

  const channelConvs = conversations.filter((c) => (c.channel ?? "whatsapp") === activeChannel);
  const counts = {
    unassigned: channelConvs.filter((c) => !c.assignedTo).length,
    mine:       channelConvs.filter((c) => c.assignedTo?.id === currentUserId).length,
    all:        channelConvs.length,
    open:       channelConvs.filter((c) => c.status === "OPEN").length,
    resolved:   channelConvs.filter((c) => c.status === "RESOLVED").length,
    paused:     channelConvs.filter((c) => c.botPaused).length,
  };

  const filtered = conversations.filter((c) => {
    // Channel tab filter
    const ch = c.channel ?? "whatsapp";
    if (ch !== activeChannel) return false;
    let pass = true;
    if (view === "unassigned") pass = !c.assignedTo;
    else if (view === "mine")  pass = c.assignedTo?.id === currentUserId;
    else if (view === "all")   pass = true;
    else if (view === "open")  pass = c.status === "OPEN";
    else if (view === "resolved") pass = c.status === "RESOLVED";
    else if (view === "paused")   pass = c.botPaused;
    if (!pass) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!c.customerName.toLowerCase().includes(q) && !c.waId.includes(q)) return false;
    }
    return true;
  });

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
          LEFT — WATI-style nav + conversation list
      ════════════════════════════════════════════════════════════ */}
      <div className="flex w-[300px] shrink-0 flex-col border-r border-gray-200 bg-white">

        {/* Search */}
        <div className="px-3 pt-4 pb-3">
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

        {/* Channel tabs — WhatsApp / Instagram */}
        <div className="flex border-b border-gray-100">
          {/* WhatsApp tab */}
          <button
            onClick={() => { setActiveChannel("whatsapp"); setSelectedId(null); setMessages([]); setConvDetail(null); }}
            className={["relative flex flex-1 items-center justify-center gap-2 px-2 py-3 text-[12px] font-semibold transition-colors",
              activeChannel === "whatsapp" ? "text-[#00a884]" : "text-gray-400 hover:text-gray-600",
            ].join(" ")}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.522 5.848L.057 23.535a.5.5 0 0 0 .611.61l5.788-1.519A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.896 0-3.67-.516-5.191-1.416l-.373-.22-3.867 1.015 1.033-3.763-.241-.389A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            <span>WhatsApp</span>
            {(() => { const n = conversations.filter((c) => (c.channel ?? "whatsapp") === "whatsapp").length; return n > 0 ? (
              <span className={["min-w-[18px] rounded-full px-1.5 py-px text-[10px] font-bold leading-none",
                activeChannel === "whatsapp" ? "bg-[#00a884]/15 text-[#00a884]" : "bg-gray-100 text-gray-400",
              ].join(" ")}>{n}</span>
            ) : null; })()}
            {activeChannel === "whatsapp" && <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-[#00a884]" />}
          </button>

          {/* Instagram tab — only shown when configured AND user is SUPER_ADMIN */}
          {igConfigured && isSuperAdmin && <button
            onClick={() => { setActiveChannel("instagram"); setSelectedId(null); setMessages([]); setConvDetail(null); }}
            className={["relative flex flex-1 items-center justify-center gap-2 px-2 py-3 text-[12px] font-semibold transition-colors",
              activeChannel === "instagram" ? "text-[#E1306C]" : "text-gray-400 hover:text-gray-600",
            ].join(" ")}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            <span>Instagram</span>
            {(() => { const n = conversations.filter((c) => c.channel === "instagram" || c.waId?.startsWith("ig_")).length; return n > 0 ? (
              <span className={["min-w-[18px] rounded-full px-1.5 py-px text-[10px] font-bold leading-none",
                activeChannel === "instagram" ? "bg-[#E1306C]/15 text-[#E1306C]" : "bg-gray-100 text-gray-400",
              ].join(" ")}>{n}</span>
            ) : null; })()}
            {activeChannel === "instagram" && (
              <div className="flex items-center gap-0.5">
                <button onClick={(e) => { e.stopPropagation(); refreshIgNames(); }} title="Refresh usernames"
                  className="flex h-5 w-5 items-center justify-center rounded-md text-[#E1306C]/60 hover:bg-[#E1306C]/10 hover:text-[#E1306C] transition">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={["h-3 w-3", igRefreshingNames ? "animate-spin" : ""].join(" ")}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </button>
                <button onClick={(e) => { e.stopPropagation(); syncInstagram(); }} title="Sync conversations"
                  className="flex h-5 w-5 items-center justify-center rounded-md text-[#E1306C]/60 hover:bg-[#E1306C]/10 hover:text-[#E1306C] transition">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={["h-3 w-3", igSyncing ? "animate-spin" : ""].join(" ")}>
                    <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
                  </svg>
                </button>
              </div>
            )}
            {activeChannel === "instagram" && <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-[#E1306C]" />}
          </button>}
        </div>

        {/* Nav sections */}
        <div className="overflow-y-auto flex-shrink-0">
          {/* CONVERSATIONS pill row */}
          <div className="px-3 pt-2 pb-1">
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">Conversations</p>
            <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
              {([
                { key: "unassigned", label: "Unassigned" },
                { key: "mine",       label: "Assigned" },
                { key: "all",        label: "All Active" },
              ] as { key: typeof view; label: string }[]).map(({ key, label }) => (
                <button key={key} onClick={() => setView(key)}
                  className={["relative flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition-all",
                    view === key
                      ? "bg-white text-brand shadow-sm font-semibold"
                      : "text-gray-500 hover:text-gray-700",
                  ].join(" ")}>
                  <span className="truncate">{label}</span>
                  {(counts[key as keyof typeof counts] ?? 0) > 0 && (
                    <span className={["rounded-full px-1.5 py-px text-[9px] font-bold leading-none",
                      view === key ? "bg-brand/15 text-brand" : "bg-gray-200 text-gray-500",
                    ].join(" ")}>
                      {counts[key as keyof typeof counts]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* STATUS pill row */}
          <div className="px-3 pt-3 pb-1">
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">Status</p>
            <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
              {([
                { key: "open",     label: "Open",       dot: "bg-emerald-400" },
                { key: "resolved", label: "Resolved",   dot: "bg-gray-300" },
                { key: "paused",   label: "Bot Paused", dot: "bg-amber-400" },
              ] as { key: typeof view; label: string; dot: string }[]).map(({ key, label, dot }) => (
                <button key={key} onClick={() => setView(key)}
                  className={["relative flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition-all",
                    view === key
                      ? "bg-white text-brand shadow-sm font-semibold"
                      : "text-gray-500 hover:text-gray-700",
                  ].join(" ")}>
                  <span className={["h-1.5 w-1.5 shrink-0 rounded-full", dot].join(" ")} />
                  <span className="truncate">{label}</span>
                  {(counts[key as keyof typeof counts] ?? 0) > 0 && (
                    <span className={["rounded-full px-1.5 py-px text-[9px] font-bold leading-none",
                      view === key ? "bg-brand/15 text-brand" : "bg-gray-200 text-gray-500",
                    ].join(" ")}>
                      {counts[key as keyof typeof counts]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="mx-4 my-3 h-px bg-gray-100" />

          {/* Global Instagram bot toggle */}
          {activeChannel === "instagram" && igConfigured && (
            <div className="mx-3 mb-3 flex items-center justify-between rounded-xl border border-[#E1306C]/20 bg-[#E1306C]/5 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4 text-[#E1306C]"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                <span className="text-[12px] font-semibold text-[#E1306C]">Instagram Bot</span>
              </div>
              <button
                onClick={() => toggleIgBot()}
                className={["relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                  igBotEnabled ? "bg-[#E1306C]" : "bg-gray-300",
                ].join(" ")}
                title={igBotEnabled ? "Bot is ON — click to disable" : "Bot is OFF — click to enable"}
              >
                <span className={["pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200",
                  igBotEnabled ? "translate-x-4" : "translate-x-0",
                ].join(" ")} />
              </button>
            </div>
          )}
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
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={["truncate text-sm", c.unreadCount > 0 ? "font-bold text-gray-900" : "font-medium text-gray-700"].join(" ")}>
                        {c.customerName}
                      </span>
                      {c.agentRequested && !c.botPaused && (
                        <span className="flex shrink-0 items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2.5 w-2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                          Needs Support
                        </span>
                      )}
                    </div>
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
                  {(c.tags.length > 0 || c.botPaused || c.agentRequested || c.broadcastOptOut) && (
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
                      {c.broadcastOptOut && (
                        <span className="flex shrink-0 items-center gap-1 rounded-md bg-red-50 border border-red-200 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2.5 w-2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                          Unsubscribed
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
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white border border-rule">
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
            <div className="shrink-0 border-b border-[#e9edef] bg-[#f0f2f5] px-5 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={selected?.customerName ?? "?"} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-gray-900">{selected?.customerName ?? "—"}</p>
                      {selected?.agentRequested && !selected?.botPaused && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2.5 w-2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                          Needs Support
                        </span>
                      )}
                      {selected?.broadcastOptOut && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2.5 w-2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                          Unsubscribed
                        </span>
                      )}
                      {selected?.botPaused && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2.5 w-2.5"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                          Bot paused
                        </span>
                      )}
                    </div>
                    {!isIgSelected && <p className="text-xs text-gray-400">{selected?.waId}</p>}
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
                  <button onClick={() => patchConv({ botPaused: !selected?.botPaused, ...(!selected?.botPaused ? { agentRequested: false } : {}) })}
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

                  {/* Delete conversation — SUPER_ADMIN only */}
                  {isSuperAdmin && (
                    <button onClick={deleteConv} title="Delete conversation"
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path strokeLinecap="round" d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  )}

                  {/* Right panel tabs */}
                  {(["contact", "bot"] as const).map((tab) => (
                    <button key={tab} onClick={() => setRightTab(tab)}
                      className={["flex h-8 w-8 items-center justify-center rounded-xl border transition",
                        rightTab === tab ? "border-brand/30 bg-brand/5 text-brand" : "border-gray-200 text-gray-400 hover:bg-gray-50",
                      ].join(" ")} title={tab === "contact" ? "Contact" : "Bot Context"}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                        {tab === "contact" && <><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></>}
                        {tab === "bot"     && <path strokeLinecap="round" strokeLinejoin="round" d="M8 9h8M8 13h6M5 3h14a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/>}
                      </svg>
                    </button>
                  ))}
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

              {/* 24h window closed banner — WhatsApp only */}
              {windowClosed && !isIgSelected && (
                <div className="mt-3 rounded-xl bg-red-50 border border-red-100 px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 text-red-500"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 6v6l4 2"/></svg>
                      <p className="text-xs text-red-700">
                        <span className="font-semibold">24-hour window closed.</span>
                        {" "}Free-text replies may not deliver.{selected?.botPaused ? " The bot will not respond until you resolve or resume it." : ""}
                      </p>
                    </div>
                    {templateConfigured ? (
                      <button onClick={() => void sendTemplate()} disabled={sendingTemplate}
                        className="shrink-0 flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50">
                        {sendingTemplate ? (
                          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        )}
                        {sendingTemplate ? "Sending…" : "Re-open"}
                      </button>
                    ) : (
                      <p className="shrink-0 text-[11px] text-red-500">No template set in WA → Settings</p>
                    )}
                  </div>
                  {templateError && <p className="mt-1 text-[11px] text-red-600">{templateError}</p>}
                </div>
              )}
            </div>

            {/* ── Chat messages ── */}
            <div className="relative flex-1 flex flex-col min-h-0">
              {/* Merged message + event feed */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
                style={isIgSelected
                  ? { background: "#fafafa" }
                  : { background: "#efeae2", backgroundImage: `url("data:image/svg+xml,%3Csvg width='400' height='400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E")` }}>
                {loadingMsgs && messages.length === 0 && (
                  <div className="flex items-center justify-center py-16">
                    <svg className="h-5 w-5 animate-spin text-gray-300" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  </div>
                )}
                {(() => {
                  // Merge messages + events into a sorted feed
                  type FeedItem = { kind: "msg"; data: Message } | { kind: "evt"; data: ConversationEvent };
                  const feed: FeedItem[] = [
                    ...messages.map((m) => ({ kind: "msg" as const, data: m })),
                    ...events.map((e) => ({ kind: "evt" as const, data: e })),
                  ].sort((a, b) => new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime());

                  let lastDay = "";
                  return feed.map((item, i) => {
                    const day = new Date(item.data.createdAt).toDateString();
                    const showSep = day !== lastDay;
                    lastDay = day;

                    if (item.kind === "evt") {
                      const ev = item.data;
                      let label = "";
                      let meta: Record<string, string> = {};
                      try { meta = ev.meta ? JSON.parse(ev.meta) : {}; } catch { /**/ }
                      if (ev.type === "ASSIGNED")       label = `${ev.actorName} assigned this conversation to ${meta.toName ?? "an agent"}`;
                      else if (ev.type === "UNASSIGNED") label = `${ev.actorName} unassigned this conversation`;
                      else if (ev.type === "STATUS_CHANGED") label = `${ev.actorName} changed status to ${(meta.toStatus ?? "").toLowerCase()}`;
                      else if (ev.type === "BOT_PAUSED")  label = `${ev.actorName} paused the bot`;
                      else if (ev.type === "BOT_RESUMED") label = `${ev.actorName} resumed the bot`;
                      else label = ev.type.replace(/_/g, " ").toLowerCase();
                      return (
                        <Fragment key={`evt-${ev.id}`}>
                          {showSep && (
                            <div className="flex justify-center py-2">
                              <span className="rounded-lg bg-[#d1f4cc]/80 backdrop-blur-sm px-3 py-1 text-[11px] font-medium text-[#54656f] shadow-sm">{dayLabel(ev.createdAt)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-center py-1">
                            <span className="rounded-lg bg-[#fffde7]/90 px-3 py-1 text-[11px] text-[#54656f] shadow-sm">
                              {label} · {fmtTime(ev.createdAt)}
                            </span>
                          </div>
                        </Fragment>
                      );
                    }

                    const m = item.data as Message;

                    // ── System event bubble ──
                    if ((m.direction as string) === "SYSTEM") {
                      const isOptEvent = m.body?.includes("replied STOP") || m.body?.includes("replied START") ||
                        m.body?.includes("🚫") || m.body?.includes("✅ Customer");
                      return (
                        <Fragment key={`msg-${m.id}`}>
                          {showSep && (
                            <div className="flex justify-center py-2">
                              <span className="rounded-lg bg-[#d1f4cc]/80 backdrop-blur-sm px-3 py-1 text-[11px] font-medium text-[#54656f] shadow-sm">{dayLabel(m.createdAt)}</span>
                            </div>
                          )}
                          <div className="flex justify-center py-1">
                            {isOptEvent ? (
                              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
                                {m.body?.includes("replied STOP") ? (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-slate-400">
                                    <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-slate-400">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                )}
                                <span className="opacity-80">{m.body}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
                                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                </svg>
                                <span>
                                  <span className="font-bold">Needs Support</span>
                                  {m.body && <span className="ml-1 opacity-80">— &ldquo;{m.body}&rdquo;</span>}
                                </span>
                              </div>
                            )}
                          </div>
                        </Fragment>
                      );
                    }

                    const msgIndex = messages.indexOf(m);
                    const isOut = m.direction === "OUTBOUND";
                    const isIgConv = isIgSelected;
                    const showAvatar = !isOut && (msgIndex === messages.length - 1 || messages[msgIndex + 1]?.direction !== "INBOUND");
                    return (
                      <Fragment key={`msg-${m.id}`}>
                        {showSep && (
                          <div className="flex justify-center py-2">
                            <span className={["rounded-lg backdrop-blur-sm px-3 py-1 text-[11px] font-medium shadow-sm", isIgConv ? "bg-[#E1306C]/10 text-[#E1306C]" : "bg-[#d1f4cc]/80 text-[#54656f]"].join(" ")}>{dayLabel(m.createdAt)}</span>
                          </div>
                        )}
                        <div className={["flex items-end gap-1.5 mb-0.5", isOut ? "justify-end" : "justify-start"].join(" ")}>
                          {!isOut && (
                            <div className="w-7 shrink-0 self-end mb-1">
                              {showAvatar && <Avatar name={selected?.customerName ?? "?"} size="sm" />}
                            </div>
                          )}
                          <div className={["max-w-[70%] flex flex-col gap-0.5", isOut ? "items-end" : "items-start"].join(" ")}>
                            {isOut && m.sentBy && (
                              <span className="text-[10px] text-[#54656f] mr-1">{m.sentBy.name}</span>
                            )}
                            <div className={["relative px-3 py-2 text-[13.5px] leading-relaxed shadow-sm",
                              isOut
                                ? isIgConv
                                  ? "rounded-[18px] rounded-br-[4px] bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white"
                                  : "rounded-[18px] rounded-br-[4px] bg-[#d9fdd3] text-[#111b21]"
                                : "rounded-[18px] rounded-bl-[4px] bg-white text-[#111b21]",
                            ].join(" ")}>
                              {(() => {
                                // Interactive message (list / buttons) from metadata
                                if (m.metadata) {
                                  let meta: Record<string, unknown> = {};
                                  try { meta = JSON.parse(m.metadata); } catch { /* ignore */ }
                                  const type = meta.type as string | undefined;

                                  if (type === "list") {
                                    // Bot sends: header/footer as string|null, button & sections flat (no action wrapper)
                                    const header   = meta.header as string | null | undefined;
                                    const footer   = meta.footer as string | null | undefined;
                                    const button   = meta.button as string | undefined;
                                    const sections = meta.sections as { title?: string; rows?: { id: string; title: string; description?: string }[] }[] | undefined;
                                    return (
                                      <div className="min-w-[200px]">
                                        {header && <p className="font-semibold text-[13px] mb-1">{header}</p>}
                                        {m.body && <p className="text-[13px] whitespace-pre-wrap mb-2">{m.body}</p>}
                                        {sections?.map((s, si) => (
                                          <div key={si} className="mb-2">
                                            {s.title && <p className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">{s.title}</p>}
                                            <div className="flex flex-col gap-1">
                                              {s.rows?.map((r) => (
                                                <div key={r.id} className={["rounded-lg px-3 py-1.5 text-[12px] border", isOut ? "border-[#25d366]/30 bg-white/20" : "border-gray-200 bg-gray-50"].join(" ")}>
                                                  <p className="font-medium">{r.title}</p>
                                                  {r.description && <p className="opacity-60 text-[11px]">{r.description}</p>}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ))}
                                        {footer && <p className="text-[11px] opacity-50 mt-1">{footer}</p>}
                                        {button && (
                                          <div className={["mt-2 text-center text-[12px] font-semibold py-1.5 rounded-lg border", isOut ? "border-[#25d366]/50 text-[#111b21]" : "border-[#25d366]/50 text-[#25d366]"].join(" ")}>
                                            ☰ {button}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }

                                  if (type === "button") {
                                    // Bot sends: buttons flat as [{ id, title }], no reply wrapper, no action wrapper
                                    const buttons = meta.buttons as { id: string; title: string }[] | undefined;
                                    return (
                                      <div className="min-w-[180px]">
                                        {m.mediaUrl && m.mediaType === "image" && (
                                          <button type="button" onClick={() => openLightbox(m.mediaUrl!)} className="block cursor-zoom-in">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={m.mediaUrl} alt="image" className="max-w-[220px] rounded-xl object-cover mb-2" />
                                          </button>
                                        )}
                                        {m.body && <p className="text-[13px] whitespace-pre-wrap mb-2">{m.body}</p>}
                                        <div className="flex flex-col gap-1">
                                          {buttons?.map((b) => (
                                            <div key={b.id} className="text-center text-[12px] font-semibold py-1.5 rounded-lg border border-[#25d366]/50 text-[#25d366]">
                                              {b.title}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  }
                                }

                                // Image
                                if (m.mediaUrl && m.mediaType === "image") return (
                                  <button type="button" onClick={() => openLightbox(m.mediaUrl!)} className="block cursor-zoom-in text-left">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={m.mediaUrl} alt="image" className="max-w-[220px] rounded-xl object-cover" />
                                    {m.body && m.body !== "[image]" && <p className="mt-1.5 text-sm whitespace-pre-wrap opacity-90">{m.body}</p>}
                                  </button>
                                );

                                // Sticker
                                if (m.mediaUrl && m.mediaType === "sticker") return (
                                  <img src={m.mediaUrl} alt="sticker" className="max-w-[120px]" />
                                );

                                // Video
                                if (m.mediaUrl && m.mediaType === "video") return (
                                  <div>
                                    <video src={m.mediaUrl} controls className="max-w-[260px] rounded-xl" preload="metadata" />
                                    {m.body && <p className="mt-1.5 text-sm whitespace-pre-wrap opacity-90">{m.body}</p>}
                                  </div>
                                );

                                // Audio / voice
                                if (m.mediaUrl && m.mediaType === "audio") return (
                                  <div className="flex items-center gap-2.5 min-w-[200px]">
                                    <div className={["flex h-8 w-8 shrink-0 items-center justify-center rounded-full", isOut ? "bg-[#00a884]/20" : "bg-gray-100"].join(" ")}>
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={["h-4 w-4", isOut ? "text-[#00a884]" : "text-gray-500"].join(" ")}>
                                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                      </svg>
                                    </div>
                                    <audio src={m.mediaUrl} controls style={{ height: "32px", flex: 1, accentColor: "#00a884" }} />
                                  </div>
                                );

                                // Outbound voice message (no mediaUrl stored — sent via portal)
                                if (!m.mediaUrl && m.mediaType === "audio") return (
                                  <div className="flex items-center gap-2 min-w-[160px]">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00a884]/20">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-[#00a884]">
                                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                      </svg>
                                    </div>
                                    <span className="text-[12px] opacity-75">Voice message</span>
                                  </div>
                                );

                                // Document
                                if (m.mediaUrl && m.mediaType === "document") return (
                                  <a href={m.mediaUrl} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-black/10 px-3 py-2.5 hover:bg-black/20 transition">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                                    <span className="text-sm font-medium">{m.body || "Document"}</span>
                                  </a>
                                );

                                // Story mention
                                if (m.mediaType === "story_mention") return (
                                  <div className="flex items-center gap-3 min-w-[200px]">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045]">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                        <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                                      </svg>
                                    </div>
                                    <div>
                                      <p className="text-[12px] font-semibold">Story Mention</p>
                                      <p className="text-[11px] opacity-60">{m.body ?? "Mentioned you in their story"}</p>
                                    </div>
                                    {m.mediaUrl && (
                                      <button type="button" onClick={() => { setStoryLightboxMediaType("img"); setStoryLightboxUrl(m.mediaUrl!); }}
                                        className="ml-auto shrink-0 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-semibold hover:bg-white/20 transition cursor-zoom-in">
                                        View
                                      </button>
                                    )}
                                  </div>
                                );

                                // Other media
                                if (m.mediaUrl) return (
                                  <a href={m.mediaUrl} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-2 underline underline-offset-2">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                                    {m.mediaType ?? "Attachment"}
                                    {m.body && <span className="ml-1 opacity-80">{m.body}</span>}
                                  </a>
                                );

                                // Product card sent from portal
                                if (m.body?.startsWith("[Product] ")) {
                                  const raw       = m.body.slice(10); // strip "[Product] "
                                  const dotIdx    = raw.lastIndexOf(" · ");
                                  const label     = dotIdx !== -1 ? raw.slice(0, dotIdx) : raw;
                                  const price     = dotIdx !== -1 ? raw.slice(dotIdx + 3) : null;
                                  return (
                                    <div className="w-[200px] overflow-hidden rounded-xl border border-white/20 bg-white/10 text-left">
                                      <div className="px-3 py-2.5">
                                        <p className="text-[12px] font-semibold leading-tight opacity-95">{label}</p>
                                        {price && <p className="mt-0.5 text-[11px] opacity-75">💰 {price}</p>}
                                      </div>
                                      <div className="border-t border-white/15 px-3 py-1.5 text-center text-[11px] font-semibold opacity-80">
                                        ↗ Order Today
                                      </div>
                                    </div>
                                  );
                                }

                                // Plain text
                                return <p className="whitespace-pre-wrap">{m.body}</p>;
                              })()}
                            </div>
                            <div className={["flex items-center gap-1 mt-0.5 px-1", isOut ? "justify-end" : "justify-start"].join(" ")}>
                              <span className="text-[11px] text-[#667781]">{fmtTime(m.createdAt)}</span>
                              {isOut && <DeliveryTick status={m.messageStatus} />}
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    );
                  });
                })()}
                <div ref={bottomRef} />
              </div>

              {/* ── Scroll-to-bottom button — sits between chat feed and reply box ── */}
              {showScrollBtn && (
                <div className="flex justify-center py-1.5 bg-transparent pointer-events-none">
                  <button
                    type="button"
                    onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
                    className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md border border-[#e5e7eb] text-[#64748b] hover:text-[#0f172a] hover:shadow-lg transition-all"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
              )}

              {/* ── Reply / Note box ── */}
              <div className="shrink-0 border-t border-[#e9edef] bg-[#f0f2f5]">
                {/* Assigned-to banner */}
                {selected?.assignedTo && (
                  <div className="flex items-center justify-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 text-amber-500"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                    <p className="text-xs text-amber-700">
                      This conversation is assigned to <span className="font-semibold">{selected.assignedTo.name}</span>
                    </p>
                  </div>
                )}

                {/* Tabs */}
                <div className="flex items-center gap-0 border-b border-[#e9edef] px-5">
                  {(["reply", "note"] as const).map((tab) => (
                    <button key={tab} onClick={() => setReplyTab(tab)}
                      className={["py-3 px-1 mr-5 text-sm font-semibold border-b-2 -mb-px transition-colors",
                        replyTab === tab
                          ? "border-brand text-brand"
                          : "border-transparent text-gray-400 hover:text-gray-600",
                      ].join(" ")}>
                      {tab === "reply" ? "Reply" : "Note"}
                    </button>
                  ))}
                </div>

                <div className="px-3 py-3">
                  {sendError && (
                    <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{sendError}</p>
                  )}

                  {/* Quick reply suggestions — only in reply mode */}
                  {replyTab === "reply" && qrQuery !== null && qrResults.length > 0 && (
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

                  {replyTab === "reply" ? (
                    <>
                      {showVoice ? (
                        <VoiceRecorder
                          sending={sendingVoice}
                          onSend={(blob) => sendVoice(blob)}
                          onCancel={() => setShowVoice(false)}
                        />
                      ) : (
                        <div className="flex items-end gap-2">
                          <input ref={fileInputRef} type="file" className="hidden" multiple
                            accept="image/*,video/*,audio/*,application/pdf"
                            onChange={(e) => { if (e.target.files?.length) stageMedia(e.target.files); e.target.value = ""; }}
                          />

                          {/* Attach — WhatsApp only */}
                          {!isIgSelected && (
                            <div className="group relative">
                              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingMedia}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#54656f] shadow-sm transition hover:bg-gray-100 disabled:opacity-40">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                              </button>
                              <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-[11px] text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
                                Attach image or file
                              </span>
                            </div>
                          )}

                          {/* Product card — WhatsApp only */}
                          {wcConfigured && !isIgSelected && (
                            <div className="group relative">
                              <button type="button" onClick={() => setShowProductPicker(true)}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#54656f] shadow-sm transition hover:bg-gray-100">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
                                </svg>
                              </button>
                              <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-[11px] text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
                                Send product card
                              </span>
                            </div>
                          )}

                          {/* Payment link — WhatsApp only, hidden if CCAvenue not configured */}
                          {ccConfigured && !isIgSelected && (
                            <div className="group relative">
                              <button type="button" onClick={() => {
                                setShowPayModal(true);
                                setPayError(null); setPaySuccess(null);
                                setPayMobile(convDetail?.waId ?? "");
                              }}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#54656f] shadow-sm transition hover:bg-gray-100">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                                </svg>
                              </button>
                              <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-[11px] text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
                                Send payment link (CCAvenue)
                              </span>
                            </div>
                          )}

                          {/* Compose pill */}
                          <div className="flex-1 rounded-[24px] bg-white shadow-sm overflow-hidden">
                            {pendingMedia.length > 0 && (
                              <div className="flex flex-wrap gap-2 px-3 pt-3">
                                {pendingMedia.map((item, idx) => (
                                  <div key={idx} className="relative group">
                                    {item.previewUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={item.previewUrl} alt="preview" className="h-16 w-16 rounded-xl object-cover border border-gray-200" />
                                    ) : (
                                      <div className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-1">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-gray-400"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                        <span className="truncate text-[9px] text-gray-400 w-full text-center px-1">{item.file.name.split(".").pop()?.toUpperCase()}</span>
                                      </div>
                                    )}
                                    <button type="button" onClick={() => removePendingMedia(idx)}
                                      className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-700 text-white opacity-0 group-hover:opacity-100 transition">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <textarea ref={textareaRef} rows={1} value={replyText}
                              onChange={(e) => handleReplyChange(e.target.value)}
                              onKeyDown={handleReplyKeyDown}
                              placeholder={pendingMedia.length > 0 ? "Add a caption… (optional)" : "Type a message"}
                              className="w-full resize-none bg-transparent px-4 py-2.5 text-sm text-[#111b21] placeholder:text-[#8696a0] focus:outline-none overflow-y-auto"
                              style={{ lineHeight: "1.5", height: "38px" }}
                            />
                          </div>

                          {/* Mic (idle, WhatsApp only) → send (typing) */}
                          {!replyText.trim() && pendingMedia.length === 0 && !isIgSelected ? (
                            <button type="button" onClick={() => setShowVoice(true)}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition hover:bg-[#00916e]"
                              title="Record voice message">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
                              </svg>
                            </button>
                          ) : (
                            <button type="button"
                              onClick={() => pendingMedia.length > 0 ? void sendMedia() : void sendReply()}
                              disabled={(uploadingMedia || sending) || (pendingMedia.length === 0 && !replyText.trim())}
                              className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:cursor-not-allowed disabled:opacity-40",
                                isIgSelected ? "bg-[#E1306C] hover:bg-[#c01f59]" : "bg-[#00a884] hover:bg-[#00916e]",
                              ].join(" ")}>
                              {(sending || uploadingMedia) ? (
                                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    /* Note input */
                    <form onSubmit={saveNote} className="flex flex-col gap-2">
                      <textarea rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Add an internal note… (not visible to customer)"
                        className="w-full resize-none rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-gray-800 placeholder:text-amber-400 focus:border-amber-300 focus:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-200 transition"
                      />
                      <button type="submit" disabled={savingNote || !noteText.trim()}
                        className="self-end flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40">
                        {savingNote ? (
                          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        )}
                        Save note
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          RIGHT — Tabbed side panel
      ════════════════════════════════════════════════════════════ */}
      {selectedId && (
        <div className="flex w-[280px] shrink-0 flex-col border-l border-gray-200 bg-white overflow-y-auto">

          {/* ── Contact tab ── */}
          {rightTab === "contact" && (
            <>
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
                        !isIgSelected ? { icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>, text: customer.phone } : null,
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
            </>
          )}

          {/* ── Bot Context tab ── */}
          {rightTab === "bot" && (
            <div className="px-5 py-5 space-y-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Bot Context</p>

              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span className={["inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
                  convDetail?.botPaused ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700",
                ].join(" ")}>
                  <span className={["h-1.5 w-1.5 rounded-full", convDetail?.botPaused ? "bg-amber-500" : "bg-emerald-500"].join(" ")} />
                  {convDetail?.botPaused ? "Bot Paused" : "Bot Active"}
                </span>
                {convDetail?.agentRequested && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    Agent Requested
                  </span>
                )}
                {convDetail?.broadcastOptOut && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    Unsubscribed from broadcasts
                  </span>
                )}
              </div>

              {/* Current flow / step */}
              <div className="space-y-3">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3.5 space-y-2.5">
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Flow</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {convDetail?.currentBotFlowName ?? convDetail?.currentBotFlowId
                        ? (convDetail.currentBotFlowName ?? `Flow #${convDetail.currentBotFlowId}`)
                        : <span className="text-gray-400 font-normal">No active flow</span>}
                    </p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Current Step</p>
                    <p className="font-mono text-xs text-gray-700">
                      {convDetail?.currentBotStepKey ?? <span className="text-gray-400 font-sans">—</span>}
                    </p>
                  </div>
                  {convDetail?.lastBotActivityAt && (
                    <div>
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Last Activity</p>
                      <p className="text-xs text-gray-500">{fmtTime(convDetail.lastBotActivityAt)}</p>
                    </div>
                  )}
                </div>

                {/* Captured variables */}
                {convDetail?.botContextVariables && (() => {
                  let vars: Record<string, string> = {};
                  try { vars = JSON.parse(convDetail.botContextVariables); } catch { return null; }
                  const entries = Object.entries(vars);
                  if (!entries.length) return null;
                  return (
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Captured Variables</p>
                      <div className="space-y-1.5">
                        {entries.map(([k, v]) => (
                          <div key={k} className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                            <span className="mt-0.5 shrink-0 font-mono text-[10px] font-bold text-brand">{k}</span>
                            <span className="truncate text-xs text-gray-700">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {!convDetail?.currentBotFlowId && !convDetail?.botContextVariables && (
                  <p className="text-xs text-gray-400">No bot activity yet for this conversation.</p>
                )}
              </div>
            </div>
          )}

          {/* Notes history — shown at bottom of contact tab and bot tab */}
          {notes.length > 0 && (
            <div className="px-5 py-4 border-t border-gray-100">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Notes ({notes.length})</p>
              <div className="space-y-2">
                {notes.map((n) => (
                  <div key={n.id} className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700">{n.body}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-gray-400">
                      <span className="font-medium text-amber-700">{n.author?.name ?? "Unknown"}</span>
                      <span>·</span>
                      <span>{fmtTime(n.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Image Lightbox ── */}
      {lightboxIdx !== null && convImages.length > 0 && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxIdx(null)}
        >
          {/* Prev */}
          {convImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => (i! - 1 + convImages.length) % convImages.length); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
          )}

          {/* Image */}
          <div className="relative flex max-h-[90vh] max-w-[90vw] items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={convImages[lightboxIdx]}
              alt="image"
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            />
          </div>

          {/* Next */}
          {convImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => (i! + 1) % convImages.length); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </button>
          )}

          {/* Close */}
          <button
            type="button"
            onClick={() => setLightboxIdx(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>

          {/* Counter */}
          {convImages.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
              {lightboxIdx + 1} / {convImages.length}
            </div>
          )}
        </div>
      )}

      {/* ── Story Mention Lightbox ── */}
      {storyLightboxUrl && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setStoryLightboxUrl(null)}
        >
          {/* Header pill */}
          <div className="mb-4 flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045]">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
              </svg>
            </div>
            <span className="text-[12px] font-semibold text-white">Story Mention</span>
          </div>

          {/* Story media — try img first, fall back to video if it errors (stories can be video/mp4) */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            {storyLightboxMediaType === "img" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={storyLightboxUrl!}
                alt="Story"
                className="max-h-[75vh] rounded-2xl object-contain shadow-2xl"
                style={{ maxWidth: "min(90vw, 360px)" }}
                onError={() => setStoryLightboxMediaType("video")}
              />
            ) : (
              <video
                src={storyLightboxUrl!}
                controls
                autoPlay
                playsInline
                className="max-h-[75vh] rounded-2xl object-contain shadow-2xl"
                style={{ maxWidth: "min(90vw, 360px)" }}
              />
            )}
          </div>

          {/* Close */}
          <button
            type="button"
            onClick={() => setStoryLightboxUrl(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {/* Product Picker modal */}
      {showProductPicker && selected && (
        <ProductPicker
          conversationId={selected.id}
          onClose={() => setShowProductPicker(false)}
          onSent={(_count) => setShowProductPicker(false)}
        />
      )}

      {/* Payment Link modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) resetPayModal(); }}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00a884]/10">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#00a884" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[13.5px] font-semibold text-gray-900">Quick Invoice</p>
                  <p className="text-[11px] text-gray-400">CCAvenue · WhatsApp</p>
                </div>
              </div>
              <button type="button" onClick={resetPayModal}
                className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Success state */}
            {paySuccess ? (
              <div className="flex flex-col items-center gap-4 px-6 py-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-[14px] font-semibold text-gray-800">Invoice Sent!</p>
                  <p className="mt-1 text-[12px] text-gray-500">CCAvenue has delivered the invoice and the payment link was sent via WhatsApp.</p>
                  <p className="mt-2 text-[11px] text-gray-400">{paySuccess}</p>
                </div>
                <button type="button" onClick={resetPayModal}
                  className="mt-2 rounded-xl bg-[#00a884] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#00916e] transition">
                  Done
                </button>
              </div>
            ) : (
              /* Form */
              <form onSubmit={(e) => { void sendPaymentLink(e); }} className="overflow-y-auto px-5 py-4 flex flex-col gap-4">

                {/* Description */}
                <div>
                  <label className="block text-[11.5px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Description / Invoice For</label>
                  <input type="text" maxLength={200} value={payDesc} onChange={(e) => setPayDesc(e.target.value)}
                    placeholder="e.g. Custom cake — 2kg chocolate" required
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-[#00a884] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 transition"
                  />
                </div>

                {/* Amount + Currency */}
                <div>
                  <label className="block text-[11.5px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Invoice Amount</label>
                  <div className="flex gap-2">
                    <select value={payCurrency} onChange={(e) => setPayCurrency(e.target.value)}
                      className="w-24 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700 focus:border-[#00a884] focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 transition">
                      {["AED","USD","EUR","GBP","SAR","INR"].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" min="0.01" max="999999" step="0.01"
                      value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="0.00" required
                      className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-[#00a884] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 transition"
                    />
                  </div>
                </div>

                {/* Delivery Type */}
                <div>
                  <label className="block text-[11.5px] font-semibold text-gray-500 mb-2 uppercase tracking-wide">Delivery Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={payDeliveryEmail} onChange={(e) => setPayDeliveryEmail(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-[#00a884] accent-[#00a884] cursor-pointer" />
                      <span className="text-sm text-gray-700 font-medium">Email</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={payDeliverySms} onChange={(e) => setPayDeliverySms(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-[#00a884] accent-[#00a884] cursor-pointer" />
                      <span className="text-sm text-gray-700 font-medium">SMS</span>
                    </label>
                  </div>
                  {!payDeliveryEmail && !payDeliverySms && (
                    <p className="mt-1.5 text-[11px] text-amber-500">Select at least one delivery method</p>
                  )}
                </div>

                {/* Email field */}
                {payDeliveryEmail && (
                  <div>
                    <label className="block text-[11.5px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Customer Email ID</label>
                    <input type="email" value={payEmail} onChange={(e) => setPayEmail(e.target.value)}
                      placeholder="customer@example.com" required={payDeliveryEmail}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-[#00a884] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 transition"
                    />
                  </div>
                )}

                {/* Mobile field */}
                {payDeliverySms && (
                  <div>
                    <label className="block text-[11.5px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Customer Mobile Number</label>
                    <input type="tel" value={payMobile} onChange={(e) => setPayMobile(e.target.value)}
                      placeholder="971XXXXXXXXX (with country code)" required={payDeliverySms}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-[#00a884] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 transition"
                    />
                    <p className="mt-1 text-[10.5px] text-gray-400">Include country code, e.g. 97150XXXXXXX</p>
                  </div>
                )}

                {/* Invoice Valid For */}
                <div>
                  <label className="block text-[11.5px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Invoice Valid For</label>
                  <div className="flex gap-2 items-center">
                    <input type="number" min={1} max={365} value={payValidFor}
                      onChange={(e) => setPayValidFor(Number(e.target.value))}
                      className="w-24 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:border-[#00a884] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 transition"
                    />
                    <span className="text-sm text-gray-500">Days</span>
                  </div>
                </div>

                {/* Terms & Conditions */}
                <div>
                  <label className="block text-[11.5px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Terms &amp; Conditions <span className="normal-case font-normal">(optional)</span></label>
                  <input type="text" maxLength={300} value={payTerms} onChange={(e) => setPayTerms(e.target.value)}
                    placeholder="e.g. No refunds after delivery"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-[#00a884] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 transition"
                  />
                </div>

                {/* Info */}
                <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <p className="text-[11px] text-blue-600 leading-relaxed">
                    CCAvenue will send the invoice via the selected channels. The payment link will also be sent via WhatsApp automatically.
                  </p>
                </div>

                {/* Error */}
                {payError && (
                  <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 mt-0.5">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <p className="text-[11.5px] text-red-600">{payError}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1 pb-1">
                  <button type="button" onClick={resetPayModal}
                    className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                    Cancel
                  </button>
                  <button type="submit"
                    disabled={sendingPay || !payAmount.trim() || !payDesc.trim() || (!payDeliveryEmail && !payDeliverySms)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#00a884] py-2.5 text-sm font-semibold text-white hover:bg-[#00916e] disabled:cursor-not-allowed disabled:opacity-40 transition">
                    {sendingPay ? (
                      <>
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                        Sending…
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                        Send Invoice
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
