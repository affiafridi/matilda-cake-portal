"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

type OrderStatus =
  | "RECEIVED"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

const STATUSES: { value: OrderStatus; label: string }[] = [
  { value: "RECEIVED", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "PREPARING", label: "In progress" },
  { value: "READY", label: "Ready" },
  { value: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

const inputCls =
  "block w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-base sm:text-sm text-ink shadow-sm focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30";

export type EditableOrder = {
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  whatsappNumber: string | null;
  customerEmail: string | null;
  deliveryDate: string; // YYYY-MM-DD
  deliveryTime: string;
  deliveryAddress: string;
  orderStatus: OrderStatus;
  totalAmount: string;
  advanceAmount: string;
  notes: string | null;
  cakeMessage: string | null;
};

export default function EditOrder({
  canEdit,
  canChangeStatus,
  order,
}: {
  canEdit: boolean;
  canChangeStatus: boolean;
  order: EditableOrder;
}) {
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
      >
        Edit order
      </button>
      {open && (
        <EditModal
          order={order}
          canChangeStatus={canChangeStatus}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function EditModal({
  order,
  canChangeStatus,
  onClose,
}: {
  order: EditableOrder;
  canChangeStatus: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    whatsappNumber: order.whatsappNumber ?? "",
    customerEmail: order.customerEmail ?? "",
    deliveryDate: order.deliveryDate,
    deliveryTime: order.deliveryTime,
    deliveryAddress: order.deliveryAddress,
    orderStatus: order.orderStatus,
    totalAmount: order.totalAmount,
    advanceAmount: order.advanceAmount,
    notes: order.notes ?? "",
    cakeMessage: order.cakeMessage ?? "",
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const totalNum = Number(form.totalAmount) || 0;
  const advanceNum = Number(form.advanceAmount) || 0;
  const remaining = Math.max(0, totalNum - advanceNum);
  const moneyChanged =
    form.totalAmount !== order.totalAmount ||
    form.advanceAmount !== order.advanceAmount;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        whatsappNumber: form.whatsappNumber.trim() || null,
        customerEmail: form.customerEmail.trim() || null,
        deliveryDate: form.deliveryDate,
        deliveryTime: form.deliveryTime,
        deliveryAddress: form.deliveryAddress.trim(),
        totalAmount: form.totalAmount ? Number(form.totalAmount) : null,
        advanceAmount: form.advanceAmount ? Number(form.advanceAmount) : null,
        notes: form.notes.trim() || null,
        cakeMessage: form.cakeMessage.trim() || null,
        reason: form.reason.trim() || undefined,
      };
      if (canChangeStatus && form.orderStatus !== order.orderStatus) {
        payload.orderStatus = form.orderStatus;
      }
      const res = await fetch(`/api/orders/${order.trackingCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || `Update failed (HTTP ${res.status})`);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-rule bg-surface shadow-xl sm:rounded-2xl"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-surface px-5 py-3">
          <h2 className="text-base font-semibold text-ink">Edit order</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink-muted hover:bg-cream/60"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <form onSubmit={onSubmit} className="space-y-5 p-5">
          <Section title="Customer">
            <Grid>
              <Field label="Name *">
                <input
                  className={inputCls}
                  value={form.customerName}
                  onChange={(e) => update("customerName", e.target.value)}
                  required
                />
              </Field>
              <Field label="Phone *">
                <input
                  className={inputCls}
                  value={form.customerPhone}
                  onChange={(e) => update("customerPhone", e.target.value)}
                  required
                />
              </Field>
              <Field label="WhatsApp">
                <input
                  className={inputCls}
                  value={form.whatsappNumber}
                  onChange={(e) => update("whatsappNumber", e.target.value)}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className={inputCls}
                  value={form.customerEmail}
                  onChange={(e) => update("customerEmail", e.target.value)}
                />
              </Field>
            </Grid>
          </Section>

          <Section title="Delivery">
            <Grid>
              <Field label="Date *">
                <input
                  type="date"
                  className={inputCls}
                  value={form.deliveryDate}
                  onChange={(e) => update("deliveryDate", e.target.value)}
                  required
                />
              </Field>
              <Field label="Time *">
                <input
                  type="time"
                  className={inputCls}
                  value={form.deliveryTime}
                  onChange={(e) => update("deliveryTime", e.target.value)}
                  required
                />
              </Field>
            </Grid>
            <Field label="Address *">
              <textarea
                rows={2}
                className={inputCls}
                value={form.deliveryAddress}
                onChange={(e) => update("deliveryAddress", e.target.value)}
                required
              />
            </Field>
          </Section>

          <Section title="Payment">
            <Grid>
              <Field label="Total (AED)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputCls}
                  value={form.totalAmount}
                  onChange={(e) => update("totalAmount", e.target.value)}
                />
              </Field>
              <Field label="Advance paid (AED)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputCls}
                  value={form.advanceAmount}
                  onChange={(e) => update("advanceAmount", e.target.value)}
                />
              </Field>
            </Grid>
            <div className="flex items-center justify-between rounded-lg bg-cream/50 px-4 py-2.5">
              <span className="text-[11px] uppercase tracking-wider text-ink-muted">
                Remaining balance
              </span>
              <span className="text-base font-semibold text-ink">
                AED {remaining.toFixed(2)}
              </span>
            </div>
          </Section>

          {canChangeStatus && (
            <Section title="Order status">
              <select
                className={inputCls}
                value={form.orderStatus}
                onChange={(e) =>
                  update("orderStatus", e.target.value as OrderStatus)
                }
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Section>
          )}

          <Section title="Notes & message">
            <Field label="Cake message">
              <input
                className={inputCls}
                value={form.cakeMessage}
                onChange={(e) => update("cakeMessage", e.target.value)}
                placeholder="Happy Birthday Sara!"
              />
            </Field>
            <Field label="Internal notes">
              <textarea
                rows={2}
                className={inputCls}
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </Field>
          </Section>

          {moneyChanged && (
            <Section title="Reason for price change">
              <Field label="Why is the amount changing? (recommended)">
                <input
                  className={inputCls}
                  value={form.reason}
                  onChange={(e) => update("reason", e.target.value)}
                  placeholder="e.g. customer added cupcakes, paid balance"
                />
              </Field>
            </Section>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-rule pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:bg-cream/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink">{label}</label>
      {children}
    </div>
  );
}
