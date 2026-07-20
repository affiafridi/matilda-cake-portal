"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type OrderStatus = "RECEIVED" | "CONFIRMED" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";

type Order = {
  id:             string;
  orderNumber:    string;
  trackingCode:   string;
  customerName:   string;
  customerPhone:  string;
  orderItems:     string;
  orderStatus:    OrderStatus;
  paymentStatus:  string;
  totalAmount:    string | null;
  deliveryDate:   string;
  deliveryTime:   string;
  branchName:     string | null;
  notes:          string | null;
};

// Active statuses an operator works through
const ACTIVE_STATUSES: OrderStatus[] = ["RECEIVED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  RECEIVED:        "CONFIRMED",
  CONFIRMED:       "PREPARING",
  PREPARING:       "READY",
  READY:           "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  RECEIVED:        "Confirm",
  CONFIRMED:       "Start Preparing",
  PREPARING:       "Mark Ready",
  READY:           "Out for Delivery",
  OUT_FOR_DELIVERY: "Mark Delivered",
};

const STATUS_STYLE: Record<string, string> = {
  RECEIVED:        "bg-slate-100 text-slate-600 border-slate-200",
  CONFIRMED:       "bg-blue-50 text-blue-700 border-blue-200",
  PREPARING:       "bg-amber-50 text-amber-700 border-amber-200",
  READY:           "bg-violet-50 text-violet-700 border-violet-200",
  OUT_FOR_DELIVERY:"bg-orange-50 text-orange-700 border-orange-200",
  DELIVERED:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED:       "bg-red-50 text-red-600 border-red-200",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", { weekday: "short", day: "numeric", month: "short" });
}

function isToday(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function isTomorrow(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function dateLabel(iso: string) {
  if (isToday(iso))    return "Today";
  if (isTomorrow(iso)) return "Tomorrow";
  return fmtDate(iso);
}

export default function OperatorPage() {
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter,   setFilter]   = useState<OrderStatus | "ALL">("ALL");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/operator/queue")
      .then((r) => r.json())
      .then((j: { ok: boolean; data: Order[]; error?: string }) => {
        if (!j.ok) throw new Error(j.error ?? "Failed to load queue");
        setOrders(j.data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function advanceStatus(orderId: string, nextStatus: OrderStatus) {
    setUpdating(orderId);
    try {
      const r = await fetch(`/api/operator/queue/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const j = await r.json() as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Update failed");
      setOrders((prev) => prev.map((o) =>
        o.id === orderId ? { ...o, orderStatus: nextStatus } : o
      ));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpdating(null);
    }
  }

  const displayed = filter === "ALL"
    ? orders.filter((o) => ACTIVE_STATUSES.includes(o.orderStatus))
    : orders.filter((o) => o.orderStatus === filter);

  const counts = ACTIVE_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = orders.filter((o) => o.orderStatus === s).length;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-canvas px-6 py-5 lg:px-8">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-ink">Operator Workspace</h1>
        <p className="mt-0.5 text-sm text-ink-muted">Your assigned order queue — tap a button to advance each order</p>
      </div>

      {/* Status filter strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip label="All Active" count={ACTIVE_STATUSES.reduce((s, k) => s + (counts[k] ?? 0), 0)} active={filter === "ALL"} onClick={() => setFilter("ALL")} />
        {ACTIVE_STATUSES.map((s) => (
          <FilterChip key={s} label={s.replace(/_/g, " ")} count={counts[s] ?? 0} active={filter === s} onClick={() => setFilter(s)} />
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white border border-rule" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-white py-20 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
            className="mx-auto mb-3 h-10 w-10 text-ink-muted/30">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>
          </svg>
          <p className="text-base font-semibold text-ink">Queue is clear</p>
          <p className="mt-1 text-sm text-ink-muted">No orders in this status right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed
            .sort((a, b) => new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime())
            .map((order) => {
              const next = NEXT_STATUS[order.orderStatus];
              const isUpdating = updating === order.id;
              const urgent = isToday(order.deliveryDate);
              return (
                <div key={order.id}
                  className={[
                    "rounded-2xl border bg-white overflow-hidden transition",
                    urgent ? "border-amber-200" : "border-rule",
                  ].join(" ")}>
                  {/* Top bar */}
                  <div className={[
                    "flex items-center justify-between gap-3 border-b px-4 py-2.5",
                    urgent ? "border-amber-100 bg-amber-50" : "border-rule bg-canvas",
                  ].join(" ")}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-bold text-sm text-ink">#{order.orderNumber}</span>
                      {order.branchName && (
                        <span className="text-[11px] text-ink-muted">· {order.branchName}</span>
                      )}
                      <span className={[
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        STATUS_STYLE[order.orderStatus] ?? "bg-slate-100 text-slate-600 border-slate-200",
                      ].join(" ")}>
                        {order.orderStatus.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {urgent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />TODAY
                        </span>
                      )}
                      <span className="text-xs font-medium text-ink-muted">
                        {dateLabel(order.deliveryDate)} · {order.deliveryTime}
                      </span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink">{order.customerName}</p>
                        <a href={`tel:${order.customerPhone}`}
                          className="text-xs text-ink-muted hover:text-brand transition">
                          {order.customerPhone}
                        </a>
                      </div>
                      <p className="mt-1 text-sm text-ink-muted leading-snug">{order.orderItems}</p>
                      {order.notes && (
                        <p className="mt-1.5 rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-1.5 text-xs text-amber-800">
                          {order.notes}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      <Link href={`/orders/${order.trackingCode}`}
                        className="rounded-xl border border-rule bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-canvas transition">
                        View
                      </Link>
                      {next && (
                        <button
                          onClick={() => advanceStatus(order.id, next)}
                          disabled={isUpdating}
                          className="rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition">
                          {isUpdating ? "Updating…" : NEXT_LABEL[order.orderStatus]}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
        active ? "border-brand bg-brand text-white" : "border-rule bg-white text-ink-muted hover:text-ink",
      ].join(" ")}>
      {label}
      <span className={["rounded-full px-1.5 py-0.5 text-[10px] font-bold",
        active ? "bg-white/20 text-white" : "bg-slate-100 text-ink-muted"].join(" ")}>
        {count}
      </span>
    </button>
  );
}
