"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { normalizeUaePhone } from "@/lib/phone";

// =====================================================
// Constants
// =====================================================

const CAKE_FLAVORS = [
  { value: "VANILLA", label: "Vanilla" },
  { value: "CHOCOLATE", label: "Chocolate" },
  { value: "RED_VELVET", label: "Red Velvet" },
] as const;

const CAKE_SIZES = [
  { value: "SIZE_750G", label: "750 g" },
  { value: "SIZE_1_2KG", label: "1.2 kg" },
  { value: "CUSTOM", label: "Custom" },
] as const;

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "ONLINE", label: "Online" },
] as const;

const PAYMENT_STATUSES = [
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PAID", label: "Paid" },
] as const;

/** Size labels for individual line items. Distinct from the cake spec enum. */
const ITEM_SIZE_OPTIONS = [
  { value: "", label: "—" },
  { value: "750g", label: "750 g" },
  { value: "1.2kg", label: "1.2 kg" },
  { value: "Custom", label: "Custom" },
] as const;

const AED = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  minimumFractionDigits: 2,
});

// =====================================================
// Types
// =====================================================

type ItemRow = {
  itemName: string;
  quantity: string;
  sizeLabel: string;
  unitPrice: string;
  notes: string;
};

const EMPTY_ITEM: ItemRow = {
  itemName: "",
  quantity: "1",
  sizeLabel: "",
  unitPrice: "",
  notes: "",
};

type FormState = {
  customerName: string;
  customerPhone: string;
  whatsappNumber: string;
  customerEmail: string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryAddress: string;
  deliveryMapLink: string;
  cakeFlavor: string;
  cakeMessage: string;
  cakeSize: string;
  customCakeSize: string;
  paymentMethod: string;
  paymentStatus: string;
  totalAmount: string;
  advanceAmount: string;
  notes: string;
  items: ItemRow[];
};

const INITIAL_FORM: FormState = {
  customerName: "",
  customerPhone: "",
  whatsappNumber: "",
  customerEmail: "",
  deliveryDate: "",
  deliveryTime: "",
  deliveryAddress: "",
  deliveryMapLink: "",
  cakeFlavor: "",
  cakeMessage: "",
  cakeSize: "SIZE_1_2KG", // smart default
  customCakeSize: "",
  paymentMethod: "CASH", // smart default
  paymentStatus: "UNPAID", // smart default
  totalAmount: "",
  advanceAmount: "",
  notes: "",
  items: [{ ...EMPTY_ITEM }],
};

type FormErrors = Partial<Record<keyof FormState, string>> & {
  /** Per-row errors for the items repeater. Keyed by row index. */
  itemRows?: Record<number, Partial<Record<keyof ItemRow, string>>>;
  /** Top-level error for the items list (e.g. "at least one required"). */
  items?: string;
};

type SuccessResult = {
  orderNumber: string;
  trackingCode: string;
};

// =====================================================
// Page
// =====================================================

export default function NewOrderPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<SuccessResult | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as keyof FormErrors]) {
      setErrors((e) => ({ ...e, [key]: undefined }));
    }
  }

  // ----- Item-row helpers -----

  function updateItem<K extends keyof ItemRow>(
    idx: number,
    key: K,
    value: ItemRow[K],
  ) {
    setForm((f) => {
      const items = f.items.slice();
      items[idx] = { ...items[idx], [key]: value };
      return { ...f, items };
    });
    // Clear that row's error if any
    if (errors.itemRows?.[idx]?.[key]) {
      setErrors((e) => {
        const itemRows = { ...(e.itemRows ?? {}) };
        const row = { ...(itemRows[idx] ?? {}) };
        delete row[key];
        itemRows[idx] = row;
        return { ...e, itemRows, items: undefined };
      });
    }
  }

  function addItemRow() {
    setForm((f) => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
    setErrors((e) => ({ ...e, items: undefined }));
  }

  function removeItemRow(idx: number) {
    setForm((f) => {
      if (f.items.length <= 1) {
        // Last row: clear it instead of removing.
        return { ...f, items: [{ ...EMPTY_ITEM }] };
      }
      return { ...f, items: f.items.filter((_, i) => i !== idx) };
    });
    setErrors((e) => {
      if (!e.itemRows) return e;
      const itemRows: Record<
        number,
        Partial<Record<keyof ItemRow, string>>
      > = {};
      Object.entries(e.itemRows).forEach(([k, v]) => {
        const i = Number(k);
        if (i < idx) itemRows[i] = v;
        else if (i > idx) itemRows[i - 1] = v;
      });
      return { ...e, itemRows };
    });
  }

  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!form.customerName.trim()) e.customerName = "Required";

    // Phone — required + UAE format
    if (!form.customerPhone.trim()) {
      e.customerPhone = "Required";
    } else {
      const phone = normalizeUaePhone(form.customerPhone);
      if (!phone.ok) e.customerPhone = phone.reason;
    }

    // WhatsApp — optional, but must be a valid UAE number when provided
    if (form.whatsappNumber.trim()) {
      const wa = normalizeUaePhone(form.whatsappNumber);
      if (!wa.ok) e.whatsappNumber = wa.reason;
    }

    if (!form.deliveryDate) e.deliveryDate = "Required";
    if (!form.deliveryTime) e.deliveryTime = "Required";
    if (!form.deliveryAddress.trim()) e.deliveryAddress = "Required";
    if (!form.cakeFlavor) e.cakeFlavor = "Pick a flavor";
    if (!form.cakeSize) e.cakeSize = "Pick a size";
    if (!form.paymentMethod) e.paymentMethod = "Pick a method";
    if (form.cakeSize === "CUSTOM" && !form.customCakeSize.trim()) {
      e.customCakeSize = "Describe the custom size";
    }

    // Items — at least one filled row, each filled row valid.
    const itemRows: Record<
      number,
      Partial<Record<keyof ItemRow, string>>
    > = {};
    let validRowCount = 0;
    form.items.forEach((row, idx) => {
      const isEmpty =
        !row.itemName.trim() &&
        !row.unitPrice.trim() &&
        !row.sizeLabel &&
        !row.notes.trim();
      if (isEmpty) return;
      validRowCount++;
      const rowErrors: Partial<Record<keyof ItemRow, string>> = {};
      if (!row.itemName.trim()) rowErrors.itemName = "Required";
      const qty = Number(row.quantity);
      if (!Number.isInteger(qty) || qty < 1) rowErrors.quantity = "Min 1";
      const price = Number(row.unitPrice);
      if (row.unitPrice === "" || Number.isNaN(price) || price < 0) {
        rowErrors.unitPrice = "Required";
      }
      if (Object.keys(rowErrors).length > 0) itemRows[idx] = rowErrors;
    });
    if (validRowCount === 0) e.items = "Add at least one item";
    if (Object.keys(itemRows).length > 0) e.itemRows = itemRows;

    return e;
  }

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setServerError(null);

    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) {
      // Item-level errors live under itemRows / items keys; scroll to the
      // items section in those cases. Otherwise scroll to the first scalar
      // field with an error.
      const scalarKeys = Object.keys(v).filter(
        (k) => k !== "itemRows" && k !== "items",
      );
      const targetKey =
        scalarKeys.length > 0 ? scalarKeys[0] : "items";
      document
        .querySelector(`[data-field="${targetKey}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSubmitting(true);
    try {
      // Both phones have already been validated above; safe to call .ok branch.
      const phoneE164 = (() => {
        const r = normalizeUaePhone(form.customerPhone);
        return r.ok ? r.e164 : form.customerPhone.trim();
      })();
      const waE164 = (() => {
        const raw = form.whatsappNumber.trim();
        if (!raw) return undefined;
        const r = normalizeUaePhone(raw);
        return r.ok ? r.e164 : raw;
      })();

      // Build structured items from the repeater, dropping empty rows.
      const items = form.items
        .filter(
          (r) =>
            r.itemName.trim() ||
            r.unitPrice.trim() ||
            r.sizeLabel ||
            r.notes.trim(),
        )
        .map((r) => {
          const quantity = Math.max(1, parseInt(r.quantity, 10) || 1);
          const unitPrice = Number(r.unitPrice) || 0;
          return {
            itemName: r.itemName.trim(),
            quantity,
            unitPrice,
            totalPrice: Number((quantity * unitPrice).toFixed(2)),
            sizeLabel: r.sizeLabel || undefined,
            notes: r.notes.trim() || undefined,
          };
        });

      // Derive a free-text summary so the legacy `orderItems` column stays
      // populated for backward compatibility with existing readers.
      const orderItemsText =
        items
          .map((it) => {
            const head = `${it.quantity}× ${it.itemName}`;
            return it.sizeLabel ? `${head} (${it.sizeLabel})` : head;
          })
          .join(", ") || "—";

      const payload = {
        customerName: form.customerName.trim(),
        customerPhone: phoneE164,
        whatsappNumber: waE164,
        customerEmail: form.customerEmail.trim() || undefined,

        deliveryDate: form.deliveryDate,
        deliveryTime: form.deliveryTime,
        deliveryAddress: form.deliveryAddress.trim(),
        deliveryMapLink: form.deliveryMapLink.trim() || undefined,

        orderItems: orderItemsText,
        items,
        cakeFlavor: form.cakeFlavor,
        cakeMessage: form.cakeMessage.trim() || undefined,
        cakeSize: form.cakeSize,
        customCakeSize:
          form.cakeSize === "CUSTOM" ? form.customCakeSize.trim() : undefined,

        paymentMethod: form.paymentMethod,
        paymentStatus: form.paymentStatus,
        totalAmount: form.totalAmount ? Number(form.totalAmount) : undefined,
        advanceAmount: form.advanceAmount
          ? Number(form.advanceAmount)
          : undefined,

        notes: form.notes.trim() || undefined,
        source: "WHATSAPP" as const,
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setServerError(
          json?.error ?? `Failed to create order (HTTP ${res.status})`,
        );
        return;
      }

      setResult({
        orderNumber: json.data.orderNumber,
        trackingCode: json.data.trackingCode,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      setServerError(
        "Network error. Please check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setForm(INITIAL_FORM);
    setErrors({});
    setServerError(null);
    setResult(null);
  }

  /** On blur, auto-format a valid UAE number to its display form. */
  function handlePhoneBlur(field: "customerPhone" | "whatsappNumber") {
    const raw = form[field];
    if (!raw.trim()) return;
    const r = normalizeUaePhone(raw);
    if (r.ok && r.display !== raw) {
      update(field, r.display);
    }
  }

  return (
    <div className="min-h-screen pb-24 sm:pb-12">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-caramel">
            Matilda Cakes · Coordinator
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            New order
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Capture a customer order from WhatsApp, phone, or walk-in.
          </p>
        </header>

        {result ? (
          <SuccessCard result={result} onReset={reset} />
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-6 sm:space-y-8">
            <Section title="Customer Details">
              <Grid>
                <Field
                  name="customerName"
                  label="Customer name"
                  required
                  error={errors.customerName}
                >
                  <input
                    type="text"
                    className={inputCls(errors.customerName)}
                    value={form.customerName}
                    onChange={(e) => update("customerName", e.target.value)}
                    placeholder="Fatima Mohamed"
                    autoComplete="off"
                  />
                </Field>

                <Field
                  name="customerPhone"
                  label="Phone"
                  required
                  error={errors.customerPhone}
                  hint="UAE number"
                >
                  <input
                    type="tel"
                    inputMode="tel"
                    className={inputCls(errors.customerPhone)}
                    value={form.customerPhone}
                    onChange={(e) => update("customerPhone", e.target.value)}
                    onBlur={() => handlePhoneBlur("customerPhone")}
                    placeholder="+971 50 123 4567"
                    autoComplete="off"
                  />
                </Field>

                <Field
                  name="whatsappNumber"
                  label="WhatsApp"
                  hint="Optional · UAE number"
                  error={errors.whatsappNumber}
                >
                  <input
                    type="tel"
                    inputMode="tel"
                    className={inputCls(errors.whatsappNumber)}
                    value={form.whatsappNumber}
                    onChange={(e) => update("whatsappNumber", e.target.value)}
                    onBlur={() => handlePhoneBlur("whatsappNumber")}
                    placeholder="If different from phone"
                    autoComplete="off"
                  />
                </Field>

                <Field name="customerEmail" label="Email" hint="Optional">
                  <input
                    type="email"
                    className={inputCls()}
                    value={form.customerEmail}
                    onChange={(e) => update("customerEmail", e.target.value)}
                    placeholder="aisha@example.com"
                    autoComplete="off"
                  />
                </Field>
              </Grid>
            </Section>

            <Section title="Delivery Details">
              <Grid>
                <Field
                  name="deliveryDate"
                  label="Date"
                  required
                  error={errors.deliveryDate}
                >
                  <input
                    type="date"
                    className={inputCls(errors.deliveryDate)}
                    value={form.deliveryDate}
                    onChange={(e) => update("deliveryDate", e.target.value)}
                  />
                </Field>

                <Field
                  name="deliveryTime"
                  label="Time"
                  required
                  error={errors.deliveryTime}
                >
                  <input
                    type="time"
                    className={inputCls(errors.deliveryTime)}
                    value={form.deliveryTime}
                    onChange={(e) => update("deliveryTime", e.target.value)}
                  />
                </Field>

                <Field
                  name="deliveryAddress"
                  label="Address"
                  required
                  full
                  error={errors.deliveryAddress}
                >
                  <textarea
                    rows={2}
                    className={inputCls(errors.deliveryAddress)}
                    value={form.deliveryAddress}
                    onChange={(e) => update("deliveryAddress", e.target.value)}
                    placeholder="Building, street, area, emirate"
                  />
                </Field>

                <Field
                  name="deliveryMapLink"
                  label="Map link"
                  hint="Optional · Google Maps URL"
                  full
                >
                  <input
                    type="url"
                    className={inputCls()}
                    value={form.deliveryMapLink}
                    onChange={(e) => update("deliveryMapLink", e.target.value)}
                    placeholder="https://maps.google.com/..."
                  />
                </Field>
              </Grid>
            </Section>

            <ItemsSection
              items={form.items}
              errors={errors.itemRows}
              listError={errors.items}
              onUpdate={updateItem}
              onAdd={addItemRow}
              onRemove={removeItemRow}
            />

            <Section title="Cake Details">
              <Grid>
                <Field
                  name="cakeFlavor"
                  label="Flavor"
                  required
                  full
                  error={errors.cakeFlavor}
                >
                  <ChipGroup
                    options={CAKE_FLAVORS}
                    value={form.cakeFlavor}
                    onChange={(v) => update("cakeFlavor", v)}
                    error={!!errors.cakeFlavor}
                  />
                </Field>

                <Field
                  name="cakeSize"
                  label="Size"
                  required
                  full
                  error={errors.cakeSize}
                >
                  <ChipGroup
                    options={CAKE_SIZES}
                    value={form.cakeSize}
                    onChange={(v) => update("cakeSize", v)}
                    error={!!errors.cakeSize}
                  />
                </Field>

                {form.cakeSize === "CUSTOM" && (
                  <Field
                    name="customCakeSize"
                    label="Custom size"
                    required
                    full
                    error={errors.customCakeSize}
                  >
                    <input
                      type="text"
                      className={inputCls(errors.customCakeSize)}
                      value={form.customCakeSize}
                      onChange={(e) => update("customCakeSize", e.target.value)}
                      placeholder="e.g. 2.5 kg, two-tier"
                    />
                  </Field>
                )}

                <Field
                  name="cakeMessage"
                  label="Cake message"
                  hint="Optional · written on the cake"
                  full
                >
                  <input
                    type="text"
                    className={inputCls()}
                    value={form.cakeMessage}
                    onChange={(e) => update("cakeMessage", e.target.value)}
                    placeholder="Happy Birthday Sara!"
                  />
                </Field>
              </Grid>
            </Section>

            <Section title="Payment Details">
              <div className="space-y-5">
                <Field
                  name="paymentMethod"
                  label="Method"
                  required
                  error={errors.paymentMethod}
                >
                  <ChipGroup
                    options={PAYMENT_METHODS}
                    value={form.paymentMethod}
                    onChange={(v) => update("paymentMethod", v)}
                    error={!!errors.paymentMethod}
                  />
                </Field>

                <Field name="paymentStatus" label="Status">
                  <ChipGroup
                    options={PAYMENT_STATUSES}
                    value={form.paymentStatus}
                    onChange={(v) => update("paymentStatus", v)}
                  />
                </Field>

                <Grid>
                  <Field name="totalAmount" label="Total" hint="Optional">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      className={inputCls()}
                      value={form.totalAmount}
                      onChange={(e) => update("totalAmount", e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field
                    name="advanceAmount"
                    label="Advance paid"
                    hint="Optional"
                  >
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      className={inputCls()}
                      value={form.advanceAmount}
                      onChange={(e) => update("advanceAmount", e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                </Grid>
              </div>
            </Section>

            <Section title="Notes">
              <Field
                name="notes"
                label="Internal notes"
                hint="Optional · visible to staff only"
              >
                <textarea
                  rows={3}
                  className={inputCls()}
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="Allergies, special requests, delivery instructions"
                />
              </Field>
            </Section>

            {serverError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
              >
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.5a.75.75 0 001.5 0v-4.5zM10 15a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{serverError}</span>
              </div>
            )}

            <ActionBar submitting={submitting} onReset={reset} />
          </form>
        )}
      </div>
    </div>
  );
}

// =====================================================
// Sub-components
// =====================================================

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-rule bg-surface p-6 shadow-sm sm:p-7">
      <h2 className="mb-5 text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{children}</div>;
}

function Field({
  name,
  label,
  required,
  error,
  hint,
  full,
  children,
}: {
  name: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div data-field={name} className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1.5 flex items-baseline gap-2 text-sm font-medium text-ink">
        <span>
          {label}
          {required && <span className="ml-0.5 text-brand">*</span>}
        </span>
        {hint && <span className="text-xs font-normal text-ink-muted">{hint}</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      )}
    </div>
  );
}

function inputCls(error?: string) {
  return [
    "block w-full rounded-lg border bg-canvas px-3.5 py-2.5 text-sm text-ink shadow-sm",
    "placeholder:text-ink-muted/70",
    "transition focus:outline-none focus:ring-2",
    error
      ? "border-danger/50 focus:border-danger focus:ring-danger/25"
      : "border-rule focus:border-focus focus:ring-focus/30",
  ].join(" ");
}

type ChipOption = { readonly value: string; readonly label: string };

function ChipGroup({
  options,
  value,
  onChange,
  error,
}: {
  options: readonly ChipOption[];
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={[
              "rounded-lg border px-3.5 py-2 text-sm font-medium transition",
              "focus:outline-none focus:ring-2 focus:ring-focus/30",
              selected
                ? "border-brand bg-brand text-white shadow-sm"
                : error
                  ? "border-danger/40 bg-surface text-ink hover:border-brand/40 hover:bg-cream/60"
                  : "border-rule bg-surface text-ink hover:border-brand/40 hover:bg-cream/60",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ItemsSection({
  items,
  errors,
  listError,
  onUpdate,
  onAdd,
  onRemove,
}: {
  items: ItemRow[];
  errors?: Record<number, Partial<Record<keyof ItemRow, string>>>;
  listError?: string;
  onUpdate: <K extends keyof ItemRow>(idx: number, key: K, value: ItemRow[K]) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}) {
  const subtotal = items.reduce((sum, r) => {
    const q = parseInt(r.quantity, 10) || 0;
    const p = Number(r.unitPrice) || 0;
    return sum + q * p;
  }, 0);

  return (
    <section
      data-field="items"
      className="rounded-2xl border border-rule bg-surface p-6 shadow-sm sm:p-7"
    >
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Order Items</h2>
        <span className="text-xs font-medium text-ink-muted">
          {items.length} {items.length === 1 ? "row" : "rows"}
        </span>
      </div>

      <div className="space-y-4">
        {items.map((row, idx) => {
          const rowErrors = errors?.[idx] ?? {};
          const qty = parseInt(row.quantity, 10) || 0;
          const price = Number(row.unitPrice) || 0;
          const lineTotal = qty * price;
          return (
            <div
              key={idx}
              className="rounded-xl border border-rule bg-canvas p-4 sm:p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Item {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="text-xs font-medium text-ink-muted hover:text-danger"
                  aria-label={`Remove item ${idx + 1}`}
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <label className="mb-1.5 block text-sm font-medium text-ink">
                    Item name<span className="ml-0.5 text-brand">*</span>
                  </label>
                  <input
                    type="text"
                    className={inputCls(rowErrors.itemName)}
                    value={row.itemName}
                    onChange={(e) => onUpdate(idx, "itemName", e.target.value)}
                    placeholder="e.g. Chocolate cake"
                  />
                  {rowErrors.itemName && (
                    <p className="mt-1.5 text-xs font-medium text-danger">
                      {rowErrors.itemName}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-1">
                  <label className="mb-1.5 block text-sm font-medium text-ink">
                    Qty<span className="ml-0.5 text-brand">*</span>
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    className={inputCls(rowErrors.quantity)}
                    value={row.quantity}
                    onChange={(e) => onUpdate(idx, "quantity", e.target.value)}
                  />
                  {rowErrors.quantity && (
                    <p className="mt-1.5 text-xs font-medium text-danger">
                      {rowErrors.quantity}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-ink">
                    Size
                  </label>
                  <select
                    className={inputCls()}
                    value={row.sizeLabel}
                    onChange={(e) => onUpdate(idx, "sizeLabel", e.target.value)}
                  >
                    {ITEM_SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="mb-1.5 block text-sm font-medium text-ink">
                    Unit price<span className="ml-0.5 text-brand">*</span>
                    <span className="ml-2 text-xs font-normal text-ink-muted">AED</span>
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    className={inputCls(rowErrors.unitPrice)}
                    value={row.unitPrice}
                    onChange={(e) => onUpdate(idx, "unitPrice", e.target.value)}
                    placeholder="0.00"
                  />
                  {rowErrors.unitPrice && (
                    <p className="mt-1.5 text-xs font-medium text-danger">
                      {rowErrors.unitPrice}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-3 sm:flex sm:items-end sm:justify-end">
                  <div className="rounded-lg bg-cream/50 px-3 py-2.5 text-right text-sm">
                    <span className="text-xs uppercase tracking-wider text-ink-muted">
                      Line total
                    </span>{" "}
                    <span className="ml-2 font-semibold text-ink">
                      {AED.format(lineTotal)}
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-6">
                  <label className="mb-1.5 block text-sm font-medium text-ink">
                    Notes{" "}
                    <span className="ml-1 text-xs font-normal text-ink-muted">
                      Optional
                    </span>
                  </label>
                  <input
                    type="text"
                    className={inputCls()}
                    value={row.notes}
                    onChange={(e) => onUpdate(idx, "notes", e.target.value)}
                    placeholder="Allergies, decoration, special instructions"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {listError && (
        <p className="mt-3 text-xs font-medium text-danger">{listError}</p>
      )}

      <div className="mt-5 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg border border-rule bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-cream/60"
        >
          + Add item
        </button>
        <div className="text-right">
          <span className="text-xs uppercase tracking-wider text-ink-muted">
            Items total
          </span>{" "}
          <span className="ml-2 text-base font-semibold text-ink">
            {AED.format(subtotal)}
          </span>
        </div>
      </div>
    </section>
  );
}

function ActionBar({
  submitting,
  onReset,
}: {
  submitting: boolean;
  onReset: () => void;
}) {
  return (
    <div
      className={[
        "fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-surface/90 px-4 py-3 backdrop-blur",
        "sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-0",
      ].join(" ")}
    >
      <div className="mx-auto flex max-w-3xl flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-cream/60 hover:text-ink"
        >
          Reset
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark active:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-focus/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create order"}
        </button>
      </div>
    </div>
  );
}

function SuccessCard({
  result,
  onReset,
}: {
  result: SuccessResult;
  onReset: () => void;
}) {
  const trackingPath = `/track/${result.trackingCode}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${trackingPath}`
        : trackingPath;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="rounded-2xl border border-rule bg-surface p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-success) 14%, white)" }}
        >
          <svg
            className="h-5 w-5 text-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink">Order created</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Share the tracking link with the customer.
          </p>

          <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Order number
              </dt>
              <dd className="mt-1 break-all font-mono text-sm font-semibold text-ink">
                {result.orderNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Tracking code
              </dt>
              <dd className="mt-1 break-all font-mono text-sm font-semibold text-ink">
                {result.trackingCode}
              </dd>
            </div>
          </dl>

          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">
              Tracking link
            </p>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Link
                href={trackingPath}
                className="break-all font-mono text-sm text-brand hover:underline"
              >
                {trackingPath}
              </Link>
              <button
                type="button"
                onClick={copy}
                className="self-start rounded-lg border border-rule bg-surface px-3 py-1 text-xs font-medium text-ink-muted hover:bg-cream/60 hover:text-ink"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark active:bg-brand-dark"
            >
              Create another order
            </button>
            <Link
              href={trackingPath}
              className="rounded-lg border border-rule bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:bg-cream/60"
            >
              View tracking page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
