import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/orders/status-badges";

const AED = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  minimumFractionDigits: 2,
});

function startOfDayUTC(d = new Date()) {
  const s = new Date(d);
  s.setUTCHours(0, 0, 0, 0);
  return s;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";

  const today = startOfDayUTC();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const [
    todayCount,
    pendingCount,
    upcomingCount,
    unpaidCount,
    revenueToday,
    branches,
    recent,
  ] = await Promise.all([
    prisma.order.count({
      where: { createdAt: { gte: today, lt: tomorrow } },
    }),
    prisma.order.count({
      where: {
        orderStatus: {
          in: ["RECEIVED", "CONFIRMED", "PREPARING"],
        },
      },
    }),
    prisma.order.count({
      where: {
        deliveryDate: { gte: today },
        orderStatus: { notIn: ["DELIVERED", "CANCELLED"] },
      },
    }),
    prisma.order.count({
      where: { paymentStatus: { in: ["UNPAID", "PARTIAL"] } },
    }),
    isAdmin
      ? prisma.order.aggregate({
          _sum: { totalAmount: true },
          where: {
            createdAt: { gte: today, lt: tomorrow },
            orderStatus: { not: "CANCELLED" },
          },
        })
      : Promise.resolve(null),
    isAdmin
      ? prisma.branch.findMany({
          where: { parentId: null, isActive: true },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            children: {
              where: { isActive: true },
              select: {
                id: true,
                _count: { select: { orders: true } },
              },
            },
          },
        })
      : Promise.resolve(null),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        trackingCode: true,
        customerName: true,
        branchName: true,
        deliveryDate: true,
        deliveryTime: true,
        totalAmount: true,
        paymentStatus: true,
        orderStatus: true,
        createdBy: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-caramel">
          {isAdmin ? "Operations overview" : "Welcome back"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
          {user.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {isAdmin
            ? "Today's snapshot across every branch."
            : "Here's what's happening today."}
        </p>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard label="Today's orders" value={todayCount} />
        <StatCard
          label="Pending"
          value={pendingCount}
          accent="caramel"
        />
        <StatCard label="Upcoming deliveries" value={upcomingCount} />
        <StatCard label="Unpaid" value={unpaidCount} accent="danger" />
      </section>

      {/* Quick actions (coordinator-friendly) */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <QuickAction
          href="/new-order"
          title="New order"
          subtitle="Capture a WhatsApp request"
        />
        <QuickAction
          href="/orders"
          title="Browse orders"
          subtitle="Search · filter · drill in"
        />
        <QuickAction
          href={`/orders?delivery=${today.toISOString().slice(0, 10)}`}
          title="Today's deliveries"
          subtitle="What's going out today"
        />
      </section>

      {/* Admin-only: revenue + branch breakdown */}
      {isAdmin && (
        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-rule bg-surface p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Revenue today
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {AED.format(Number(revenueToday?._sum.totalAmount ?? 0))}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Across all non-cancelled orders.
            </p>
          </div>
          <div className="rounded-2xl border border-rule bg-surface p-5 shadow-sm lg:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Branches
            </p>
            <ul className="mt-3 divide-y divide-rule text-sm">
              {(branches ?? []).map((b) => {
                const total = b.children.reduce(
                  (s, c) => s + c._count.orders,
                  0,
                );
                return (
                  <li
                    key={b.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="font-medium text-ink">{b.name}</span>
                    <span className="text-ink-muted">
                      {total} {total === 1 ? "order" : "orders"}
                    </span>
                  </li>
                );
              })}
              {(!branches || branches.length === 0) && (
                <li className="py-4 text-center text-xs text-ink-muted">
                  No branches yet.
                </li>
              )}
            </ul>
          </div>
        </section>
      )}

      {/* Recent orders */}
      <section className="mt-8 rounded-2xl border border-rule bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-rule px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-ink">Recent orders</h2>
          <Link
            href="/orders"
            className="text-xs font-medium text-brand hover:underline"
          >
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-ink-muted">
            No orders yet. Hit{" "}
            <Link href="/new-order" className="text-brand hover:underline">
              + New order
            </Link>{" "}
            to create one.
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
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {recent.map((o) => (
                  <tr key={o.id} className="hover:bg-cream/20">
                    <td className="px-4 py-3">
                      <Link
                        href={`/orders/${o.trackingCode}`}
                        className="font-mono text-xs font-semibold text-brand hover:underline"
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink">{o.customerName}</td>
                    <td className="px-4 py-3 text-ink-muted">
                      {o.branchName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {o.deliveryDate
                        .toISOString()
                        .slice(0, 10)}{" "}
                      · {o.deliveryTime}
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
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Mobile cards */}
            <ul className="divide-y divide-rule sm:hidden">
              {recent.map((o) => (
                <li key={o.id} className="px-4 py-3">
                  <Link
                    href={`/orders/${o.trackingCode}`}
                    className="block space-y-1.5"
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
          </>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "caramel" | "danger";
}) {
  const accentCls =
    accent === "caramel"
      ? "text-caramel"
      : accent === "danger"
        ? "text-danger"
        : "text-ink";
  return (
    <div className="rounded-2xl border border-rule bg-surface p-4 shadow-sm sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold sm:text-3xl ${accentCls}`}>
        {value}
      </p>
    </div>
  );
}

function QuickAction({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-rule bg-surface p-5 shadow-sm transition hover:border-brand/40 hover:bg-cream/30"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-semibold text-ink">{title}</p>
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        </div>
        <span className="text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-brand">
          →
        </span>
      </div>
    </Link>
  );
}
