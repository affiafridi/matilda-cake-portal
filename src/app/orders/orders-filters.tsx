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
  "rounded-lg border border-rule bg-canvas px-3 py-2 text-sm text-ink shadow-sm focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30";

export default function OrdersFilters() {
  const router = useRouter();
  const search = useSearchParams();

  const [q, setQ] = useState(search.get("q") ?? "");
  const status = search.get("status") ?? "";
  const payment = search.get("payment") ?? "";
  const branchId = search.get("branchId") ?? "";
  const delivery = search.get("delivery") ?? "";

  const [branches, setBranches] = useState<BranchGroup[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/branches")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j && j.ok) setBranches(j.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function update(key: string, value: string) {
    const params = new URLSearchParams(search.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page"); // reset pagination
    router.replace(`/orders?${params.toString()}`);
  }

  function reset() {
    router.replace("/orders");
    setQ("");
  }

  return (
    <div className="rounded-2xl border border-rule bg-surface p-4 shadow-sm sm:p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update("q", q.trim());
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-12"
      >
        <input
          type="search"
          placeholder="Search order #, tracking code, name, phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inputCls} sm:col-span-4`}
        />

        <select
          value={status}
          onChange={(e) => update("status", e.target.value)}
          className={`${inputCls} sm:col-span-2`}
        >
          {ORDER_STATUSES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={payment}
          onChange={(e) => update("payment", e.target.value)}
          className={`${inputCls} sm:col-span-2`}
        >
          {PAYMENT_STATUSES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={branchId}
          onChange={(e) => update("branchId", e.target.value)}
          className={`${inputCls} sm:col-span-2`}
        >
          <option value="">All branches</option>
          {branches.map((p) => (
            <optgroup key={p.id} label={p.name}>
              {p.children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <input
          type="date"
          value={delivery}
          onChange={(e) => update("delivery", e.target.value)}
          className={`${inputCls} sm:col-span-2`}
          aria-label="Delivery date"
        />
      </form>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={reset}
          className="text-xs font-medium text-ink-muted hover:text-ink"
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
