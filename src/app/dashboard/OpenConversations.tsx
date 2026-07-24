"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

type Conv = {
  id: string;
  customerName: string;
  lastMessageBody: string | null;
  lastMessageAt: string;
  unreadCount: number;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function OpenConversationsPanel({ initial }: { initial: Conv[] }) {
  const [convs, setConvs]     = useState<Conv[]>(initial);
  const [pulse, setPulse]     = useState(false);
  const [lastSeen, setLastSeen] = useState(() => initial[0]?.lastMessageAt ?? "");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/conversations", { cache: "no-store" });
      if (!res.ok) return;
      const data: Conv[] = await res.json();

      // Check if anything actually changed
      const newest = data[0]?.lastMessageAt ?? "";
      if (newest && newest !== lastSeen) {
        setPulse(true);
        setTimeout(() => setPulse(false), 1200);
        setLastSeen(newest);
      }

      setConvs(data);
    } catch { /* silent fail */ }
  }, [lastSeen]);

  useEffect(() => {
    refresh(); // immediately correct any stale initial data
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Also refresh when tab becomes visible after being hidden
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return (
    <div className="rounded-xl bg-[#f6f8fa] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[13.5px] font-semibold text-[#0f172a]">Open Conversations</p>
          {pulse && (
            <span className="flex h-2 w-2 rounded-full bg-[#25D366] animate-ping" />
          )}
        </div>
        <Link href="/wa/inbox" className="text-[12px] font-semibold text-[#64748b] transition hover:text-[#374151]">
          Go to inbox →
        </Link>
      </div>

      {convs.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[12px] text-[#9ca3af]">No open conversations.</p>
        </div>
      ) : (
        <ul className="divide-y divide-[#e9edf2]">
          {convs.map((conv) => (
            <li key={conv.id}>
              <Link href="/wa/inbox" className="flex items-start gap-3 py-2.5 -mx-1 px-1 rounded-xl transition hover:bg-[#eceef1]">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#128C7E]/10 text-xs font-bold text-[#128C7E]">
                  {conv.customerName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-[12.5px] font-semibold text-[#0f172a]">{conv.customerName}</p>
                    <span className="shrink-0 text-[10px] text-[#9ca3af] whitespace-nowrap">{timeAgo(conv.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-[11px] text-[#64748b]">{conv.lastMessageBody ?? "Media message"}</p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="shrink-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#25D366] px-1 text-[10px] font-bold text-white">
                    {conv.unreadCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
