import Link from "next/link";
import { Prisma, type OrderStatus, type PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/orders/status-badges";
import OrdersFilters from "./orders-filters";

// Ensure the page renders per-request so the coordinator scoping
// (where.createdById = actor.id) is applied every time, never from cache.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const AED = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  minimumFractionDigits: 2,
});

const ORDER_STATUS_VALUES: OrderStatus[] = [
  "RECEIVED",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];
const PAYMENT_STATUS_VALUES: PaymentStatus[] = [
  "UNPAID",
  "PARTIAL",
  "PAID",
  "REFUNDED",
];

function dayBounds(iso: string): { start: Date; end: Date } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const statusParam = typeof sp.status === "string" ? sp.status : "";
  const paymentParam = typeof sp.payment === "string" ? sp.payment : "";
  const branchId =
    typeof sp.branchId === "string" && sp.branchId ? sp.branchId : null;
  const deliveryStr =
    typeof sp.delivery === "string" ? sp.delivery : "";
  const page = Math.max(
    1,
    Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1,
  );

  // Coordinators only see orders they created. Admins / chefs see everything.
  // (Layout already guarantees the user is logged in.)
  const actor = await getCurrentUser();
  const where: Prisma.OrderWhereInput = {};
  if (actor && actor.role === "COORDINATOR") {
    where.createdById = actor.id;
  }
  if (
    statusParam &&
    (ORDER_STATUS_VALUES as string[]).includes(statusParam)
  ) {
    where.orderStatus = statusParam as OrderStatus;
  }
  if (
    paymentParam &&
    (PAYMENT_STATUS_VALUES as string[]).includes(paymentParam)
  ) {
    where.paymentStatus = paymentParam as PaymentStatus;
  }
  if (branchId) where.branchId = branchId;
  if (deliveryStr) {
    const range = dayBounds(deliveryStr);
    if (range) where.deliveryDate = { gte: range.start, lt: range.end };
  }
  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { trackingCode: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerPhone: { contains: q, mode: "insensitive" } },
    ];
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        trackingCode: true,
        customerName: true,
        customerPhone: true,
        branchName: true,
        deliveryDate: true,
        deliveryTime: true,
        totalAmount: true,
        paymentStatus: true,
        orderStatus: true,
        createdBy: { select: { name: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Build a query string with everything except page (for prev/next links).
  const qsBase = new URLSearchParams();
  if (q) qsBase.set("q", q);
  if (statusParam) qsBase.set("status", statusParam);
  if (paymentParam) qsBase.set("payment", paymentParam);
  if (branchId) qsBase.set("branchId", branchId);
  if (deliveryStr) qsBase.set("delivery", deliveryStr);
  const buildPageHref = (p: number) => {
    const qs = new URLSearchParams(qsBase);
    qs.set("page", String(p));
    return `/orders?${qs.toString()}`;
  };

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-caramel">
            Operations
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Orders</h1>
        </div>
        <Link
          href="/new-order"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
        >
          + New order
        </Link>
      </header>

      <OrdersFilters />

      <div className="mt-5 rounded-2xl border border-rule bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-rule px-4 py-3 sm:px-5">
          <p className="text-sm text-ink-muted">
            {total} {total === 1 ? "result" : "results"}
            {page > 1 ? ` · page ${page} of ${totalPages}` : ""}
          </p>
        </div>

        {orders.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-ink-muted">
            No orders match these filters.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-sm sm:table">
              <thead className="bg-cream/40 text-left text-[11px] uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-4 py-2.5">Order</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Branch</th>
                  <th className="px-4 py-2.5">Delivery</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5">Payment</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Created by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-cream/20">
                    <td className="px-4 py-3">
                      <Link
                        href={`/orders/${o.trackingCode}`}
                        className="font-mono text-xs font-semibold text-brand hover:underline"
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink">
                      <div>{o.customerName}</div>
                      <div className="text-xs text-ink-muted">
                        {o.customerPhone}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {o.branchName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {o.deliveryDate.toISOString().slice(0, 10)} ·{" "}
                      {o.deliveryTime}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink">
                      {AED.format(Number(o.totalAmount ?? 0))}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={o.paymentStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={o.orderStatus} />
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      {o.createdBy?.name ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y divide-rule sm:hidden">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/orders/${o.trackingCode}`}
                    className="block space-y-1.5 px-4 py-3 hover:bg-cream/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-brand">
                        {o.orderNumber}
                      </span>
                      <OrderStatusBadge status={o.orderStatus} />
                    </div>
                    <div className="text-sm font-medium text-ink">
                      {o.customerName}
                    </div>
                    <div className="flex items-center justify-between text-xs text-ink-muted">
                      <span>{o.branchName ?? "—"}</span>
                      <span>
                        {o.deliveryDate.toISOString().slice(0, 10)} ·{" "}
                        {o.deliveryTime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink">
                        {AED.format(Number(o.totalAmount ?? 0))}
                      </span>
                      <PaymentStatusBadge status={o.paymentStatus} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            {totalPages > 1 && (
              <nav className="flex items-center justify-between border-t border-rule px-4 py-3 sm:px-5">
                {page > 1 ? (
                  <Link
                    href={buildPageHref(page - 1)}
                    className="rounded-md border border-rule px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream/60"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-xs text-ink-muted">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={buildPageHref(page + 1)}
                    className="rounded-md border border-rule px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream/60"
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
