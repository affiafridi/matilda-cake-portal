"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { normalizeUaePhone } from "@/lib/phone";
import type {
  WooProductSummary,
  WooVariation,
} from "@/lib/woocommerce-types";

// =====================================================
// Constants
// =====================================================

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
  /** WooCommerce product ID, set when a Woo product is linked (otherwise ""). */
  woocommerceProductId: string;
  /** WooCommerce variation ID, set when a variation is picked (otherwise ""). */
  woocommerceVariationId: string;
  /** Full Woo variation name (e.g. "Chocolate / 1.2 kg"); empty for unlinked rows. */
  variationName: string;
  /** Cached product image URL — display only, not sent to the API. */
  productImage: string;
  /** Free-text size description shown when sizeLabel === "Custom". */
  customSize: string;
  /** Coordinator-uploaded reference image URL (custom items). */
  referenceImageUrl: string;
  /** Original filename of the uploaded reference image. */
  referenceImageName: string;
  /** MIME type of the uploaded reference image. */
  referenceImageType: string;
};

const EMPTY_ITEM: ItemRow = {
  itemName: "",
  quantity: "1",
  sizeLabel: "",
  unitPrice: "",
  notes: "",
  woocommerceProductId: "",
  woocommerceVariationId: "",
  variationName: "",
  productImage: "",
  customSize: "",
  referenceImageUrl: "",
  referenceImageName: "",
  referenceImageType: "",
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
  /** Cake message — rendered at the bottom of the Order Items section. */
  cakeMessage: string;
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
  cakeMessage: "",
  paymentMethod: "CASH", // smart default
  paymentStatus: "UNPAID", // smart default
  totalAmount: "",
  advanceAmount: "",
  notes: "",
  items: [{ ...EMPTY_ITEM }],
};

// =====================================================
// Derivation helpers — populate legacy cake spec columns
// from the structured item list so the API contract stays
// backward-compatible even though the UI no longer asks
// for them directly.
// =====================================================

type CakeFlavor = "VANILLA" | "CHOCOLATE" | "RED_VELVET";
type CakeSize = "SIZE_750G" | "SIZE_1_2KG" | "CUSTOM";

function deriveCakeFlavor(items: { itemName: string }[]): CakeFlavor {
  const haystack = items.map((i) => i.itemName).join(" ").toLowerCase();
  if (/red\s*velvet/.test(haystack)) return "RED_VELVET";
  if (/chocolate|choco/.test(haystack)) return "CHOCOLATE";
  return "VANILLA";
}

function deriveCakeSize(
  items: { sizeLabel?: string | null; customSize?: string | null }[],
): { size: CakeSize; customLabel?: string } {
  const first = items[0];
  const raw = first?.sizeLabel ?? "";
  const label = raw.toLowerCase().trim();
  if (!label) return { size: "SIZE_1_2KG" };
  if (/750\s*g/.test(label)) return { size: "SIZE_750G" };
  if (/1[.,]?2\s*kg/.test(label)) return { size: "SIZE_1_2KG" };
  // Custom — prefer the dedicated customSize text, fall back to the label.
  return {
    size: "CUSTOM",
    customLabel: first?.customSize?.trim() || raw,
  };
}

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
  /** True once the coordinator types in the Total field; stops auto-sync. */
  const [totalTouched, setTotalTouched] = useState(false);

  // Auto-fill payment Total from items when at least one item is linked to
  // a WooCommerce product, until the coordinator manually edits the field.
  useEffect(() => {
    if (totalTouched) return;
    const hasWooItem = form.items.some((r) => r.woocommerceProductId);
    if (!hasWooItem) return;
    const subtotal = form.items.reduce((sum, r) => {
      const q = parseInt(r.quantity, 10) || 0;
      const p = Number(r.unitPrice) || 0;
      return sum + q * p;
    }, 0);
    if (subtotal <= 0) return;
    const formatted = subtotal.toFixed(2);
    setForm((f) =>
      f.totalAmount === formatted ? f : { ...f, totalAmount: formatted },
    );
  }, [form.items, totalTouched]);

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
    if (!form.paymentMethod) e.paymentMethod = "Pick a method";

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
      if (row.sizeLabel === "Custom" && !row.customSize.trim()) {
        rowErrors.customSize = "Describe the custom size or weight";
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
          const isCustom = !r.woocommerceProductId;
          return {
            itemName: r.itemName.trim(),
            quantity,
            unitPrice,
            totalPrice: Number((quantity * unitPrice).toFixed(2)),
            sizeLabel: r.sizeLabel || undefined,
            notes: r.notes.trim() || undefined,
            woocommerceProductId: r.woocommerceProductId || undefined,
            woocommerceVariationId: r.woocommerceVariationId || undefined,
            variationName: r.variationName || undefined,
            isCustom,
            customSize:
              r.sizeLabel === "Custom"
                ? r.customSize.trim() || undefined
                : undefined,
            referenceImageUrl: r.referenceImageUrl || undefined,
            referenceImageName: r.referenceImageName || undefined,
            referenceImageType: r.referenceImageType || undefined,
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
        // Legacy cake-spec columns derived from items so the API stays
        // backward-compatible. The structured `items` array is canonical.
        cakeFlavor: deriveCakeFlavor(items),
        cakeMessage: form.cakeMessage.trim() || undefined,
        cakeSize: deriveCakeSize(items).size,
        customCakeSize: deriveCakeSize(items).customLabel,

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
    setTotalTouched(false);
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
      <div className="mx-auto max-w-[1400px] px-3 py-7 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <header className="mb-8 sm:mb-10">
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
          <form onSubmit={onSubmit} noValidate className="space-y-3 sm:space-y-5">
            <div className="grid gap-3 sm:gap-5 lg:grid-cols-2">
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
            </div>

            <ItemsSection
              items={form.items}
              errors={errors.itemRows}
              listError={errors.items}
              onUpdate={updateItem}
              onAdd={addItemRow}
              onRemove={removeItemRow}
              cakeMessage={form.cakeMessage}
              onCakeMessageChange={(v) => update("cakeMessage", v)}
            />

            <div className="grid gap-3 sm:gap-5 lg:grid-cols-2">
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
                  <Field
                    name="totalAmount"
                    label="Total"
                    hint={
                      !totalTouched &&
                      form.items.some((r) => r.woocommerceProductId)
                        ? "Auto-filled from items"
                        : "Optional"
                    }
                  >
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      className={inputCls()}
                      value={form.totalAmount}
                      onChange={(e) => {
                        setTotalTouched(true);
                        update("totalAmount", e.target.value);
                      }}
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
            </div>

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
    <section className="rounded-2xl border border-rule bg-surface p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
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
    // text-base on mobile (≥16px) prevents iOS Safari from auto-zooming on focus.
    "block w-full rounded-lg border bg-canvas px-3.5 py-2.5 text-base sm:text-sm text-ink shadow-sm",
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

// =====================================================
// Hooks (local)
// =====================================================

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// =====================================================
// Per-item row — encapsulates Woo search & variation state
// =====================================================

type RowUpdate = <K extends keyof ItemRow>(
  idx: number,
  key: K,
  value: ItemRow[K],
) => void;

type SearchStatus = "idle" | "loading" | "ready" | "error";

// =====================================================
// Inline icon primitives — kept tiny to avoid a dep
// =====================================================

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="4"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="m14 14 4 4" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41 41 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  );
}

// =====================================================
// Image preview lightbox
// =====================================================

function ImagePreviewModal({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  // Close on Esc + lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Product preview"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md sm:max-w-lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-[80vh] w-full rounded-xl bg-surface object-contain shadow-2xl"
        />
        {alt && (
          <p className="mt-3 text-center text-sm font-medium text-white drop-shadow">
            {alt}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface/95 text-ink shadow-lg transition hover:bg-surface focus:outline-none focus:ring-2 focus:ring-focus/40"
          aria-label="Close preview"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// =====================================================
// Reference image upload (custom items only)
// =====================================================

function ReferenceImageUpload({
  row,
  idx,
  onUpdate,
  onPreview,
}: {
  row: ItemRow;
  idx: number;
  onUpdate: RowUpdate;
  onPreview: (src: string, label: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads/order-item-reference", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok: true;
            data: {
              referenceImageUrl: string;
              referenceImageName: string;
              referenceImageType: string;
            };
          }
        | { ok: false; error: string }
        | null;
      if (!res.ok || !json || !json.ok) {
        setError(
          (json && !json.ok && json.error) ||
            `Upload failed (HTTP ${res.status})`,
        );
        return;
      }
      onUpdate(idx, "referenceImageUrl", json.data.referenceImageUrl);
      onUpdate(idx, "referenceImageName", json.data.referenceImageName);
      onUpdate(idx, "referenceImageType", json.data.referenceImageType);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function clear() {
    onUpdate(idx, "referenceImageUrl", "");
    onUpdate(idx, "referenceImageName", "");
    onUpdate(idx, "referenceImageType", "");
    setError(null);
  }

  return (
    <div className="mt-2 rounded-lg border border-dashed border-rule bg-canvas/60 p-2.5">
      {row.referenceImageUrl ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              onPreview(
                row.referenceImageUrl,
                row.referenceImageName || "Reference image",
              )
            }
            className="block h-12 w-12 shrink-0 overflow-hidden rounded-md transition focus:outline-none focus:ring-2 focus:ring-focus/40 sm:h-14 sm:w-14"
            aria-label="Preview reference image"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.referenceImageUrl}
              alt=""
              className="h-full w-full bg-canvas object-cover transition hover:opacity-90"
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {row.referenceImageName || "Reference image"}
            </p>
            <p className="text-xs text-ink-muted">Reference attached</p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-cream/80 hover:text-danger"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-xs font-medium text-ink-muted transition hover:text-ink disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Spinner className="h-4 w-4 text-brand" />
              Uploading…
            </>
          ) : (
            <>
              <PlusIcon className="h-4 w-4" />
              Add reference image
              <span className="text-ink-muted/80">
                · jpg, png, webp · max 5 MB
              </span>
            </>
          )}
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {error && (
        <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      )}
    </div>
  );
}

// =====================================================
// Per-item row
// =====================================================

function ItemRowFields({
  row,
  idx,
  errors,
  onUpdate,
  onRemove,
}: {
  row: ItemRow;
  idx: number;
  errors?: Partial<Record<keyof ItemRow, string>>;
  onUpdate: RowUpdate;
  onRemove: (idx: number) => void;
}) {
  const rowErrors = errors ?? {};
  const qty = parseInt(row.quantity, 10) || 0;
  const price = Number(row.unitPrice) || 0;
  const lineTotal = qty * price;

  // ----- Product search -----
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchResults, setSearchResults] = useState<WooProductSummary[]>([]);
  const debouncedQuery = useDebouncedValue(row.itemName, 300);

  // ----- Variations (when a Woo product is linked) -----
  const [variations, setVariations] = useState<WooVariation[]>([]);
  const [variationStatus, setVariationStatus] = useState<SearchStatus>("idle");

  // ----- Notes are collapsed by default — fewer fields on screen -----
  const [notesOpen, setNotesOpen] = useState(!!row.notes);

  // ----- Image preview lightbox (product image OR reference image) -----
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState<string>("");

  // Close search dropdown on outside click.
  useEffect(() => {
    if (!searchOpen) return;
    function handler(e: MouseEvent | TouchEvent) {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(e.target as Node)) return;
      setSearchOpen(false);
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [searchOpen]);

  // Run a debounced product search whenever the dropdown is open.
  useEffect(() => {
    if (!searchOpen) return;
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchStatus("idle");
      return;
    }
    let cancelled = false;
    setSearchStatus("loading");
    fetch(`/api/woocommerce/products/search?q=${encodeURIComponent(q)}`)
      .then(async (r) => {
        const json = (await r.json().catch(() => null)) as
          | { ok: true; data: WooProductSummary[] }
          | { ok: false; error: string }
          | null;
        if (cancelled) return;
        if (json && json.ok) {
          setSearchResults(json.data);
          setSearchStatus("ready");
        } else {
          setSearchResults([]);
          setSearchStatus("error");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSearchResults([]);
        setSearchStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, searchOpen]);

  // Fetch variations whenever the linked Woo product changes.
  useEffect(() => {
    const id = row.woocommerceProductId;
    if (!id) {
      setVariations([]);
      setVariationStatus("idle");
      return;
    }
    let cancelled = false;
    setVariationStatus("loading");
    fetch(`/api/woocommerce/products/${encodeURIComponent(id)}/variations`)
      .then(async (r) => {
        const json = (await r.json().catch(() => null)) as
          | { ok: true; data: WooVariation[] }
          | { ok: false; error: string }
          | null;
        if (cancelled) return;
        if (json && json.ok) {
          setVariations(json.data);
          setVariationStatus("ready");
        } else {
          setVariations([]);
          setVariationStatus("error");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setVariations([]);
        setVariationStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [row.woocommerceProductId]);

  function selectProduct(p: WooProductSummary) {
    onUpdate(idx, "itemName", p.name);
    onUpdate(idx, "woocommerceProductId", String(p.id));
    onUpdate(idx, "woocommerceVariationId", "");
    onUpdate(idx, "variationName", "");
    onUpdate(idx, "productImage", p.images[0]?.src ?? "");
    if (p.price) onUpdate(idx, "unitPrice", p.price);
    setSearchOpen(false);
  }

  function clearLinkedProduct() {
    onUpdate(idx, "woocommerceProductId", "");
    onUpdate(idx, "woocommerceVariationId", "");
    onUpdate(idx, "variationName", "");
    onUpdate(idx, "productImage", "");
  }

  function selectVariation(varId: string) {
    if (!varId) {
      onUpdate(idx, "woocommerceVariationId", "");
      onUpdate(idx, "variationName", "");
      return;
    }
    const v = variations.find((x) => String(x.id) === varId);
    if (!v) return;
    onUpdate(idx, "woocommerceVariationId", String(v.id));
    onUpdate(idx, "variationName", v.name);
    const sizeAttr = v.attributes.find((a) =>
      /size|weight|kg|gram/i.test(a.name),
    );
    onUpdate(idx, "sizeLabel", sizeAttr?.option ?? v.name);
    if (v.price) onUpdate(idx, "unitPrice", v.price);
  }

  const useVariations =
    !!row.woocommerceProductId && variations.length > 0;
  const linkedLabel =
    row.variationName ||
    (row.itemName && row.itemName.trim()) ||
    `Product #${row.woocommerceProductId}`;
  const compactLabelCls =
    "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink-muted";

  return (
    <div className="rounded-xl border border-rule bg-canvas">
      {/* Header strip — rounded-t-xl matches card corners without clipping the dropdown below */}
      <div className="flex items-center justify-between rounded-t-xl border-b border-rule bg-cream/40 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Item {idx + 1}
        </span>
        <button
          type="button"
          onClick={() => onRemove(idx)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-cream/80 hover:text-danger"
          aria-label={`Remove item ${idx + 1}`}
        >
          <TrashIcon className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>

      {/* Body */}
      <div className="space-y-4 p-4 sm:p-5">
        {/* Product search */}
        <div ref={wrapperRef}>
          <label className="mb-1.5 block text-sm font-medium text-ink">
            Item Name<span className="ml-0.5 text-brand">*</span>
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              className={`${inputCls(rowErrors.itemName)} pl-9`}
              value={row.itemName}
              onChange={(e) => onUpdate(idx, "itemName", e.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search products or type a custom name"
              autoComplete="off"
            />
            {searchOpen && row.itemName.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-rule bg-surface shadow-lg">
                {searchStatus === "loading" && (
                  <div className="flex items-center justify-center px-3 py-4">
                    <Spinner className="h-4 w-4 text-brand" />
                  </div>
                )}
                {searchStatus === "error" && (
                  <div className="px-3 py-2 text-xs text-danger">
                    Search unavailable. You can still type a custom name.
                  </div>
                )}
                {searchStatus === "ready" && searchResults.length === 0 && (
                  <div className="px-3 py-2 text-xs text-ink-muted">
                    No matches — keep typing for a custom item.
                  </div>
                )}
                {searchResults.map((p) => {
                  const thumb = p.images[0]?.src;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectProduct(p)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-cream/60"
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          loading="lazy"
                          className="h-9 w-9 shrink-0 rounded-md bg-canvas object-cover"
                        />
                      ) : (
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cream text-ink-muted"
                          aria-hidden="true"
                        >
                          <SearchIcon className="h-4 w-4" />
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate text-ink">
                        {p.name}
                      </span>
                      {p.price && (
                        <span className="shrink-0 text-xs text-ink-muted">
                          AED {p.price}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {rowErrors.itemName && (
            <p className="mt-1.5 text-xs font-medium text-danger">
              {rowErrors.itemName}
            </p>
          )}
          {row.woocommerceProductId && (
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-rule bg-surface p-2 sm:p-2.5">
              <div className="relative shrink-0">
                {row.productImage ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewSrc(row.productImage);
                      setPreviewLabel(linkedLabel);
                    }}
                    className="block h-12 w-12 overflow-hidden rounded-md transition focus:outline-none focus:ring-2 focus:ring-focus/40 sm:h-14 sm:w-14"
                    aria-label={`Preview ${linkedLabel}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.productImage}
                      alt=""
                      loading="lazy"
                      className="h-full w-full bg-canvas object-cover transition hover:opacity-90"
                    />
                  </button>
                ) : (
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-md bg-cream text-ink-muted sm:h-14 sm:w-14"
                    aria-hidden="true"
                  >
                    <SearchIcon className="h-5 w-5" />
                  </div>
                )}
                <span
                  className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-success text-white shadow-sm ring-2 ring-surface"
                  aria-label="Linked"
                >
                  <CheckIcon className="h-2.5 w-2.5" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">
                  {linkedLabel}
                </div>
                <div className="truncate text-xs text-ink-muted">
                  {row.variationName
                    ? `Variation · ${row.variationName}`
                    : "Linked to website product"}
                </div>
              </div>
              <button
                type="button"
                onClick={clearLinkedProduct}
                className="shrink-0 rounded-md p-1.5 text-base leading-none text-ink-muted transition hover:bg-cream/80 hover:text-danger"
                aria-label="Unlink WooCommerce product"
              >
                ×
              </button>
            </div>
          )}
          {previewSrc && (
            <ImagePreviewModal
              src={previewSrc}
              alt={previewLabel}
              onClose={() => setPreviewSrc(null)}
            />
          )}

          {/* Custom-item path — badge + reference image upload (no Woo link) */}
          {!row.woocommerceProductId && row.itemName.trim() && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-cream/80 px-2.5 py-1 text-xs font-medium text-ink">
              <span
                className="h-1.5 w-1.5 rounded-full bg-caramel"
                aria-hidden="true"
              />
              Custom item
            </span>
          )}
          {!row.woocommerceProductId && (
            <ReferenceImageUpload
              row={row}
              idx={idx}
              onUpdate={onUpdate}
              onPreview={(src, label) => {
                setPreviewSrc(src);
                setPreviewLabel(label);
              }}
            />
          )}
        </div>

        {/* Compact 4-up: Qty / Size / Price / Total */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-2">
            <label className={compactLabelCls}>
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
              <p className="mt-1 text-xs font-medium text-danger">
                {rowErrors.quantity}
              </p>
            )}
          </div>

          <div className="sm:col-span-4">
            <label className={`${compactLabelCls} flex items-center gap-1.5`}>
              <span>Size</span>
              {variationStatus === "loading" && (
                <Spinner className="h-3 w-3 text-ink-muted" />
              )}
            </label>
            {useVariations ? (
              <select
                className={inputCls()}
                value={row.woocommerceVariationId}
                onChange={(e) => selectVariation(e.target.value)}
              >
                <option value="">Select size…</option>
                {variations.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.price ? ` — AED ${v.price}` : ""}
                  </option>
                ))}
              </select>
            ) : (
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
            )}
          </div>

          <div className="sm:col-span-3">
            <label className={compactLabelCls}>
              Price (AED)<span className="ml-0.5 text-brand">*</span>
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
              <p className="mt-1 text-xs font-medium text-danger">
                {rowErrors.unitPrice}
              </p>
            )}
          </div>

          <div className="sm:col-span-3 sm:flex sm:flex-col sm:items-end sm:justify-end">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Line total
            </span>
            <span className="mt-0.5 text-base font-semibold text-ink">
              {AED.format(lineTotal)}
            </span>
          </div>
        </div>

        {/* Custom size — required when sizeLabel is Custom */}
        {row.sizeLabel === "Custom" && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              Custom size / weight
              <span className="ml-0.5 text-brand">*</span>
            </label>
            <input
              type="text"
              className={inputCls(rowErrors.customSize)}
              value={row.customSize}
              onChange={(e) => onUpdate(idx, "customSize", e.target.value)}
              placeholder="2 kg, 3 tier, 8 inch, 20 cupcakes"
            />
            {rowErrors.customSize && (
              <p className="mt-1.5 text-xs font-medium text-danger">
                {rowErrors.customSize}
              </p>
            )}
          </div>
        )}

        {/* Notes — collapsed by default */}
        {notesOpen ? (
          <div>
            <label className={compactLabelCls}>Note</label>
            <input
              type="text"
              className={inputCls()}
              value={row.notes}
              onChange={(e) => onUpdate(idx, "notes", e.target.value)}
              placeholder="Allergies, decoration, special instructions"
              autoFocus
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted transition hover:text-ink"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add note
          </button>
        )}
      </div>
    </div>
  );
}

// =====================================================
// Items section — repeater + total + cake message
// =====================================================

function ItemsSection({
  items,
  errors,
  listError,
  onUpdate,
  onAdd,
  onRemove,
  cakeMessage,
  onCakeMessageChange,
}: {
  items: ItemRow[];
  errors?: Record<number, Partial<Record<keyof ItemRow, string>>>;
  listError?: string;
  onUpdate: <K extends keyof ItemRow>(
    idx: number,
    key: K,
    value: ItemRow[K],
  ) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  cakeMessage: string;
  onCakeMessageChange: (v: string) => void;
}) {
  const subtotal = items.reduce((sum, r) => {
    const q = parseInt(r.quantity, 10) || 0;
    const p = Number(r.unitPrice) || 0;
    return sum + q * p;
  }, 0);

  return (
    <section
      data-field="items"
      className="rounded-2xl border border-rule bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Order Items</h2>
        <span className="text-xs font-medium text-ink-muted">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="space-y-3">
        {items.map((row, idx) => (
          <ItemRowFields
            key={idx}
            row={row}
            idx={idx}
            errors={errors?.[idx]}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        ))}
      </div>

      {listError && (
        <p className="mt-3 text-xs font-medium text-danger">{listError}</p>
      )}

      {/* Add another item — full-width dashed CTA */}
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-rule bg-transparent py-3.5 text-sm font-medium text-ink-muted transition hover:border-brand/40 hover:bg-cream/40 hover:text-ink"
      >
        <PlusIcon className="h-4 w-4" />
        Add another item
      </button>

      {/* Items total */}
      <div className="mt-5 flex items-center justify-between rounded-xl bg-cream/50 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Items total
        </span>
        <span className="text-lg font-semibold text-ink">
          {AED.format(subtotal)}
        </span>
      </div>

      {/* Cake message — moved here from the old Cake Details section */}
      <div className="mt-6 border-t border-rule pt-5">
        <label className="mb-1.5 flex items-baseline gap-2 text-sm font-medium text-ink">
          <span>Cake message</span>
          <span className="text-xs font-normal text-ink-muted">
            Optional · written on the cake
          </span>
        </label>
        <input
          type="text"
          className={inputCls()}
          value={cakeMessage}
          onChange={(e) => onCakeMessageChange(e.target.value)}
          placeholder="Happy Birthday Sara!"
        />
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
      <div className="mx-auto flex max-w-[1400px] flex-col-reverse gap-2 px-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6 lg:px-8">
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
