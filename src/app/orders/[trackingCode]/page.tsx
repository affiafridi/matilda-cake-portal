import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/orders/status-badges";
import { getBucketName, getSignedReadUrl } from "@/lib/storage/gcs";
import EditOrder from "./edit-order";

export const dynamic = "force-dynamic";

const AED = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  minimumFractionDigits: 2,
});

const SIGNED_TTL_MS = 15 * 60 * 1000;

async function resolveImageUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  if (/^https?:\/\//i.test(stored)) return stored;
  if (stored.startsWith("/")) return stored;
  if (!getBucketName()) return null;
  try {
    return await getSignedReadUrl(stored, SIGNED_TTL_MS);
  } catch {
    return null;
  }
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ trackingCode: string }>;
}) {
  const { trackingCode } = await params;
  const actor = await getCurrentUser();

  const order = await prisma.order.findUnique({
    where: { trackingCode },
    include: {
      branch: { include: { parent: true } },
      customer: true,
      createdBy: { select: { id: true, name: true, role: true } },
      assignedChef: { select: { id: true, name: true, role: true } },
      items: { orderBy: { createdAt: "asc" } },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
      amountChanges: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
    },
  });

  if (!order) notFound();

  // Coordinators can only open their own orders.
  if (
    actor &&
    actor.role === "COORDINATOR" &&
    order.createdById !== actor.id
  ) {
    notFound();
  }

  // Pre-sign reference images on the server so the client can <img src> directly.
  const itemsWithUrls = await Promise.all(
    order.items.map(async (it) => ({
      ...it,
      displayImageUrl: await resolveImageUrl(it.referenceImageUrl),
    })),
  );

  const itemsTotal = order.items.reduce(
    (s, it) => s + Number(it.totalPrice),
    0,
  );

  // ----- Edit permissions -----
  const isAdmin =
    actor?.role === "SUPER_ADMIN" || actor?.role === "ADMIN";
  const isOwner = actor?.id === order.createdById;
  const isLocked =
    order.orderStatus === "DELIVERED" || order.orderStatus === "CANCELLED";
  const canEdit =
    !!actor &&
    (isAdmin || (isOwner && !isLocked)) &&
    (!isLocked || actor.role === "SUPER_ADMIN");
  const canChangeStatus = isAdmin;

  const editableOrder = {
    trackingCode: order.trackingCode,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    whatsappNumber: order.whatsappNumber,
    customerEmail: order.customerEmail,
    deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
    deliveryTime: order.deliveryTime,
    deliveryAddress: order.deliveryAddress,
    orderStatus: order.orderStatus,
    totalAmount:
      order.totalAmount !== null ? String(Number(order.totalAmount)) : "",
    advanceAmount:
      order.advanceAmount !== null ? String(Number(order.advanceAmount)) : "",
    notes: order.notes,
    cakeMessage: order.cakeMessage,
  };

  // ----- Merged activity timeline (status + amount changes, newest first) -----
  type ActivityItem =
    | {
        kind: "status";
        id: string;
        createdAt: Date;
        actorName: string | null;
        oldStatus: string | null;
        newStatus: string;
        note: string | null;
      }
    | {
        kind: "amount";
        id: string;
        createdAt: Date;
        actorName: string | null;
        prevTotal: number | null;
        newTotal: number | null;
        prevAdvance: number | null;
        newAdvance: number | null;
        delta: number;
        reason: string | null;
      };

  const activity: ActivityItem[] = [
    ...order.statusHistory.map((h) => ({
      kind: "status" as const,
      id: h.id,
      createdAt: h.createdAt,
      actorName: h.changedBy?.name ?? null,
      oldStatus: h.oldStatus ?? null,
      newStatus: h.newStatus,
      note: h.note,
    })),
    ...order.amountChanges.map((c) => ({
      kind: "amount" as const,
      id: c.id,
      createdAt: c.createdAt,
      actorName: c.changedBy?.name ?? null,
      prevTotal: c.prevTotal !== null ? Number(c.prevTotal) : null,
      newTotal: c.newTotal !== null ? Number(c.newTotal) : null,
      prevAdvance: c.prevAdvance !== null ? Number(c.prevAdvance) : null,
      newAdvance: c.newAdvance !== null ? Number(c.newAdvance) : null,
      delta: c.delta !== null ? Number(c.delta) : 0,
      reason: c.reason,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link
          href="/orders"
          className="text-ink-muted hover:text-ink"
        >
          ← Orders
        </Link>
      </div>

      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-caramel">
            Order
          </p>
          <h1 className="mt-1 font-mono text-2xl font-semibold text-ink">
            {order.orderNumber}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Tracking code:{" "}
            <span className="font-mono">{order.trackingCode}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.orderStatus} />
          <PaymentStatusBadge status={order.paymentStatus} />
          <EditOrder
            canEdit={canEdit}
            canChangeStatus={canChangeStatus}
            order={editableOrder}
          />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Items */}
          <Section title="Items">
            <ul className="divide-y divide-rule">
              {itemsWithUrls.map((it) => (
                <li
                  key={it.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start"
                >
                  {it.displayImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a
                      href={it.displayImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-canvas"
                    >
                      <img
                        src={it.displayImageUrl}
                        alt={it.itemName}
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-cream text-xs text-ink-muted">
                      No image
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium text-ink">{it.itemName}</p>
                      <p className="font-medium text-ink">
                        {AED.format(Number(it.totalPrice))}
                      </p>
                    </div>
                    <p className="text-xs text-ink-muted">
                      {it.quantity} × {AED.format(Number(it.unitPrice))}
                      {it.sizeLabel ? ` · ${it.sizeLabel}` : ""}
                      {it.customSize ? ` · ${it.customSize}` : ""}
                    </p>
                    {it.variationName && (
                      <p className="text-xs text-ink-muted">
                        Variation: {it.variationName}
                      </p>
                    )}
                    {it.notes && (
                      <p className="mt-1 text-xs text-ink-muted">
                        Note: {it.notes}
                      </p>
                    )}
                    {it.isCustom && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium text-ink">
                        Custom item
                      </span>
                    )}
                  </div>
                </li>
              ))}
              {order.items.length === 0 && (
                <li className="py-6 text-center text-sm text-ink-muted">
                  No structured items — see free-text below.
                </li>
              )}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-rule pt-3">
              <span className="text-[11px] uppercase tracking-wider text-ink-muted">
                Items total
              </span>
              <span className="text-base font-semibold text-ink">
                {AED.format(itemsTotal)}
              </span>
            </div>
          </Section>

          {/* Reference images grid (only items that have one) */}
          {itemsWithUrls.some((i) => i.displayImageUrl) && (
            <Section title="Reference images">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {itemsWithUrls
                  .filter((i) => i.displayImageUrl)
                  .map((i) => (
                    <a
                      key={i.id}
                      href={i.displayImageUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block overflow-hidden rounded-lg border border-rule bg-canvas"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={i.displayImageUrl ?? ""}
                        alt={i.itemName}
                        className="h-32 w-full object-cover transition group-hover:opacity-90"
                      />
                      <div className="px-2 py-1.5 text-xs text-ink-muted">
                        {i.itemName}
                      </div>
                    </a>
                  ))}
              </div>
            </Section>
          )}

          {/* Free-text items + cake message + notes */}
          {(order.orderItems || order.cakeMessage || order.notes) && (
            <Section title="Notes & message">
              {order.cakeMessage && (
                <div className="mb-3">
                  <p className="text-[11px] uppercase tracking-wider text-ink-muted">
                    Cake message
                  </p>
                  <p className="mt-1 text-sm text-ink">{order.cakeMessage}</p>
                </div>
              )}
              {order.notes && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-muted">
                    Internal notes
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink">
                    {order.notes}
                  </p>
                </div>
              )}
            </Section>
          )}

          {/* Activity — status changes + amount changes, newest first */}
          <Section title="Activity">
            {activity.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No edits yet. Status and price changes will show up here.
              </p>
            ) : (
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li
                    key={`${a.kind}-${a.id}`}
                    className="flex items-start gap-3 text-sm"
                  >
                    <span
                      className={[
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        a.kind === "amount" ? "bg-caramel" : "bg-brand",
                      ].join(" ")}
                    />
                    <div className="min-w-0 flex-1">
                      {a.kind === "status" ? (
                        <p className="font-medium text-ink">
                          {a.oldStatus
                            ? `Status: ${a.oldStatus} → ${a.newStatus}`
                            : `Status: ${a.newStatus}`}
                        </p>
                      ) : (
                        <p className="font-medium text-ink">
                          {a.prevTotal !== a.newTotal && a.newTotal !== null
                            ? `Total: ${AED.format(a.prevTotal ?? 0)} → ${AED.format(
                                a.newTotal,
                              )} (${a.delta >= 0 ? "+" : ""}${a.delta.toFixed(2)})`
                            : a.prevAdvance !== a.newAdvance &&
                                a.newAdvance !== null
                              ? `Advance: ${AED.format(a.prevAdvance ?? 0)} → ${AED.format(
                                  a.newAdvance,
                                )}`
                              : "Payment updated"}
                        </p>
                      )}
                      <p className="text-xs text-ink-muted">
                        {a.createdAt
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")}
                        {a.actorName ? ` · by ${a.actorName}` : ""}
                      </p>
                      {(a.kind === "status" ? a.note : a.reason) && (
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {a.kind === "status" ? a.note : a.reason}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* Side column */}
        <aside className="space-y-4">
          <Section title="Customer">
            <dl className="space-y-2 text-sm">
              <Field label="Name" value={order.customerName} />
              <Field label="Phone" value={order.customerPhone} mono />
              <Field
                label="WhatsApp"
                value={order.whatsappNumber ?? "—"}
                mono
              />
              <Field
                label="Email"
                value={order.customerEmail ?? "—"}
              />
            </dl>
          </Section>

          <Section title="Delivery">
            <dl className="space-y-2 text-sm">
              <Field
                label="Branch"
                value={
                  order.branchName ??
                  (order.branch
                    ? `${order.branch.parent?.name ?? ""} ${
                        order.branch.parent ? "- " : ""
                      }${order.branch.name}`.trim()
                    : "—")
                }
              />
              <Field
                label="Date"
                value={order.deliveryDate.toISOString().slice(0, 10)}
              />
              <Field label="Time" value={order.deliveryTime} />
              <Field label="Address" value={order.deliveryAddress} />
              {order.deliveryMapLink && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-ink-muted">
                    Map
                  </dt>
                  <dd className="mt-0.5">
                    <a
                      href={order.deliveryMapLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-brand hover:underline break-all"
                    >
                      Open in Maps ↗
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </Section>

          <Section title="Payment">
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-[11px] uppercase tracking-wider text-ink-muted">
                  Status
                </dt>
                <dd>
                  <PaymentStatusBadge status={order.paymentStatus} />
                </dd>
              </div>
              <Field label="Method" value={order.paymentMethod} />
              <Field
                label="Total"
                value={AED.format(Number(order.totalAmount ?? 0))}
              />
              <Field
                label="Advance"
                value={AED.format(Number(order.advanceAmount ?? 0))}
              />
              <Field
                label="Balance"
                value={AED.format(
                  Number(order.totalAmount ?? 0) -
                    Number(order.advanceAmount ?? 0),
                )}
              />
            </dl>
          </Section>

          <Section title="Staff">
            <dl className="space-y-2 text-sm">
              <Field
                label="Created by"
                value={order.createdBy?.name ?? "—"}
              />
              <Field
                label="Assigned chef"
                value={order.assignedChef?.name ?? "—"}
              />
              <Field
                label="Source"
                value={order.source.replace("_", " ").toLowerCase()}
              />
              <Field
                label="Created"
                value={order.createdAt
                  .toISOString()
                  .slice(0, 16)
                  .replace("T", " ")}
              />
            </dl>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-rule bg-surface p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm text-ink ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
