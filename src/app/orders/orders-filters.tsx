"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type BranchGroup = {
  id: string;
  name: string;
  children: { id: string; name: string }[];
};

const ORDER_STATUSES = [
  { value: "", label: "All statuses" },
  { value: "RECEIVED", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "PREPARING", label: "In progress" },
  { value: "READY", label: "Ready" },
  { value: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

const PAYMENT_STATUSES = [
  { value: "", label: "All payments" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PAID", label: "Paid" },
  { value: "REFUNDED", label: "Refunded" },
];

const inputCls =
  "w-full rounded-xl border border-rule bg-surface px-3 py-2 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20";

const selectCls =
  "w-full appearance-none rounded-xl border border-rule bg-surface px-3 py-2 pr-8 text-sm text-ink focus:border-caramel focus:outline-none focus:ring-2 focus:ring-caramel/20 cursor-pointer";

function SelectArrow() {
  return (
    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-ink-muted">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}

export default function OrdersFilters() {
  const router = useRouter();
  const search = useSearchParams();

  const [q, setQ] = useState(search.get("q") ?? "");
  const status   = search.get("status")   ?? "";
  const payment  = search.get("payment")  ?? "";
  const branchId = search.get("branchId") ?? "";
  const delivery = search.get("delivery") ?? "";

  const [branches, setBranches] = useState<BranchGroup[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/branches")
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j?.ok) setBranches(j.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function update(key: string, value: string) {
    const params = new URLSearchParams(search.toString());
    if (value) params.set(key, value); else params.delete(key);
    params.delete("page");
    router.replace(`/orders?${params.toString()}`);
  }

  function reset() {
    router.replace("/orders");
    setQ("");
  }

  const hasFilters = q || status || payment || branchId || delivery;

  return (
    <div className="rounded-2xl border border-rule bg-white p-4 sm:p-5">
      <form
        onSubmit={(e) => { e.preventDefault(); update("q", q.trim()); }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-12"
      >
        {/* Search */}
        <div className="relative sm:col-span-4">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            type="search"
            placeholder="Search order #, tracking code, name, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={`${inputCls} pl-9`}
          />
        </div>

        {/* Status */}
        <div className="relative sm:col-span-2">
          <select value={status} onChange={(e) => update("status", e.target.value)} className={selectCls}>
            {ORDER_STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <SelectArrow />
        </div>

        {/* Payment */}
        <div className="relative sm:col-span-2">
          <select value={payment} onChange={(e) => update("payment", e.target.value)} className={selectCls}>
            {PAYMENT_STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <SelectArrow />
        </div>

        {/* Branch */}
        <div className="relative sm:col-span-2">
          <select value={branchId} onChange={(e) => update("branchId", e.target.value)} className={selectCls}>
            <option value="">All branches</option>
            {branches.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
          <SelectArrow />
        </div>

        {/* Date */}
        <div className="relative sm:col-span-2">
          <input
            type="date"
            value={delivery}
            onChange={(e) => update("delivery", e.target.value)}
            className={inputCls}
            aria-label="Delivery date"
          />
        </div>
      </form>

      {hasFilters && (
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={reset} className="text-xs font-medium text-ink-muted hover:text-ink transition">
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
