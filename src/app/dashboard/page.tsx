import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/orders/status-badges";
import { DashboardFilters } from "./filters";

export const dynamic = "force-dynamic";

const AED = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  minimumFractionDigits: 0,
});

function startOfDayUTC(d = new Date()) {
  const s = new Date(d);
  s.setUTCHours(0, 0, 0, 0);
  return s;
}

// ── Inline SVG bar chart (server-rendered, no JS library) ─────────────────

type DayBar = { label: string; count: number };

function WeekChart({ bars }: { bars: DayBar[] }) {
  const max = Math.max(...bars.map((b) => b.count), 1);
  const W = 480; const H = 120; const BAR_W = 44; const GAP = 12;
  const totalW = bars.length * (BAR_W + GAP) - GAP;
  const offsetX = (W - totalW) / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H + 32}`} xmlns="http://www.w3.org/2000/svg" className="w-full">
      {bars.map((b, i) => {
        const barH = max === 0 ? 4 : Math.max(4, (b.count / max) * H);
        const x = offsetX + i * (BAR_W + GAP);
        const y = H - barH;
        const isMax = b.count === max && b.count > 0;
        return (
          <g key={b.label}>
            {/* background track */}
            <rect x={x} y={0} width={BAR_W} height={H} rx={8} fill="var(--color-cream)" />
            {/* filled bar */}
            <rect x={x} y={y} width={BAR_W} height={barH} rx={8}
              fill={isMax ? "var(--color-brand)" : "var(--color-caramel)"} opacity={isMax ? 1 : 0.75} />
            {/* count label */}
            {b.count > 0 && (
              <text x={x + BAR_W / 2} y={y - 5} textAnchor="middle" fontSize={10}
                fontWeight={700} fill={isMax ? "var(--color-brand)" : "var(--color-ink-muted)"}>
                {b.count}
              </text>
            )}
            {/* day label */}
            <text x={x + BAR_W / 2} y={H + 18} textAnchor="middle" fontSize={11}
              fontWeight={600} fill="var(--color-ink-muted)">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Delivery status mini-bar ──────────────────────────────────────────────

function DeliveryBar({ sent, failed }: { sent: number; failed: number }) {
  const total = sent + failed;
  if (total === 0) return <div className="h-1.5 w-full rounded-full bg-rule" />;
  const pct = Math.round((sent / total) * 100);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-rule">
      <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Date range helper ─────────────────────────────────────────────────────

function getDateRange(range: string) {
  const today = startOfDayUTC();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  switch (range) {
    case "yesterday": {
      const start = new Date(today);
      start.setUTCDate(start.getUTCDate() - 1);
      return { start, end: today, label: "Yesterday", chartDays: 7 };
    }
    case "7d": {
      const start = new Date(today);
      start.setUTCDate(start.getUTCDate() - 6);
      return { start, end: tomorrow, label: "Last 7 Days", chartDays: 7 };
    }
    case "30d": {
      const start = new Date(today);
      start.setUTCDate(start.getUTCDate() - 29);
      return { start, end: tomorrow, label: "Last 30 Days", chartDays: 30 };
    }
    case "month": {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
      return { start, end: tomorrow, label: "This Month", chartDays: daysInMonth };
    }
    default:
      return { start: today, end: tomorrow, label: "Today", chartDays: 7 };
  }
}

// ── Main page ──────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const rangeParam  = (typeof sp.range  === "string" ? sp.range  : "today");
  const branchParam = (typeof sp.branch === "string" ? sp.branch : "all");

  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const scopeFilter = user.role === "AGENT" ? { createdById: user.id } : {};

  const { start: rangeStart, end: rangeEnd, label: rangeLabel, chartDays } = getDateRange(rangeParam);

  const today = startOfDayUTC();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

  // ── Fetch branches first so we can build branch filter ──
  const branches = isAdmin
    ? await prisma.branch.findMany({
        where: { parentId: null, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, name: true,
          children: {
            where: { isActive: true },
            select: {
              id: true, name: true,
              _count: { select: { orders: { where: { orderStatus: { not: "CANCELLED" } } } } },
            },
          },
        },
      })
    : null;

  // Branch name filter (admin only — matches parent or any child branch name)
  const branchNameFilter: { branchName?: { in: string[] } } = {};
  if (isAdmin && branchParam !== "all" && branches) {
    const selected = branches.find((b) => b.id === branchParam);
    if (selected) {
      const names = [selected.name, ...selected.children.map((c) => c.name)];
      branchNameFilter.branchName = { in: names };
    }
  }

  // ── Core order stats ──
  const [
    rangeOrderCount,
    pendingCount,
    upcomingCount,
    unpaidCount,
    revenueRange,
    recent,
    chartOrdersRaw,
  ] = await Promise.all([
    // Orders in selected range (+ branch filter)
    prisma.order.count({
      where: { ...scopeFilter, ...branchNameFilter, createdAt: { gte: rangeStart, lt: rangeEnd } },
    }),
    prisma.order.count({
      where: { ...scopeFilter, orderStatus: { in: ["RECEIVED", "CONFIRMED", "PREPARING"] } },
    }),
    prisma.order.count({
      where: { ...scopeFilter, deliveryDate: { gte: today }, orderStatus: { notIn: ["DELIVERED", "CANCELLED"] } },
    }),
    prisma.order.count({
      where: { ...scopeFilter, paymentStatus: { in: ["UNPAID", "PARTIAL"] } },
    }),
    // Revenue in selected range (+ branch filter)
    isAdmin
      ? prisma.order.aggregate({
          _sum: { totalAmount: true },
          where: { ...branchNameFilter, createdAt: { gte: rangeStart, lt: rangeEnd }, orderStatus: { not: "CANCELLED" } },
        })
      : Promise.resolve(null),
    // Recent orders in selected range (+ branch filter)
    prisma.order.findMany({
      where: { ...scopeFilter, ...branchNameFilter, createdAt: { gte: rangeStart, lt: rangeEnd } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true, orderNumber: true, trackingCode: true,
        customerName: true, branchName: true,
        deliveryDate: true, deliveryTime: true,
        totalAmount: true, paymentStatus: true, orderStatus: true,
      },
    }),
    // Chart — dynamic window based on selected range
    prisma.$queryRaw<{ day: Date; count: number }[]>`
      SELECT DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC') AS day,
             COUNT(*)::int AS count
      FROM "Order"
      WHERE "createdAt" >= ${rangeStart}
      GROUP BY day ORDER BY day
    `,
  ]);

  // ── WhatsApp stats (separate DB — safe fallback) ──
  let waCustomers = 0;
  let waCampaignTotal = 0;
  let waMsgSent = 0;
  let recentCampaigns: { template_name: string; sent: number; failed: number; total: number; created_at: string }[] = [];
  try {
    const { botQuery } = await import("@/lib/botdb");
    await botQuery(`CREATE TABLE IF NOT EXISTS campaign_logs (
      id SERIAL PRIMARY KEY, template_name TEXT NOT NULL,
      template_language TEXT NOT NULL, total INTEGER NOT NULL,
      sent INTEGER NOT NULL, failed INTEGER NOT NULL,
      results JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    const rangeStartISO = rangeStart.toISOString();
    const rangeEndISO   = rangeEnd.toISOString();

    // Campaign queries — date-filtered (these always work)
    const [campR, recR] = await Promise.all([
      botQuery(
        "SELECT COUNT(*)::int AS n, COALESCE(SUM(sent),0)::int AS s FROM campaign_logs WHERE created_at >= $1 AND created_at < $2",
        [rangeStartISO, rangeEndISO]
      ),
      botQuery(
        "SELECT template_name, sent, failed, total, created_at FROM campaign_logs WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at DESC LIMIT 4",
        [rangeStartISO, rangeEndISO]
      ),
    ]);
    waCampaignTotal = campR.rows[0]?.n ?? 0;
    waMsgSent       = campR.rows[0]?.s ?? 0;
    recentCampaigns = recR.rows as typeof recentCampaigns;

    // Customer count — separate try so a missing column doesn't break campaigns
    try {
      const cols = await botQuery(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'customers' AND column_name = 'created_at'`
      );
      const hasCratedAt = (cols.rowCount ?? 0) > 0;
      const custR = hasCratedAt
        ? await botQuery(
            "SELECT COUNT(*)::int AS n FROM customers WHERE created_at >= $1 AND created_at < $2",
            [rangeStartISO, rangeEndISO]
          )
        : await botQuery("SELECT COUNT(*)::int AS n FROM customers");
      waCustomers = custR.rows[0]?.n ?? 0;
    } catch { /* customers table unavailable */ }
  } catch { /* bot DB unavailable — show zeros */ }

  // ── Build chart bars (dynamic range) ──
  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const bars: DayBar[] = Array.from({ length: chartDays }, (_, i) => {
    const d = new Date(rangeStart);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const row = chartOrdersRaw.find((r) => new Date(r.day).toISOString().slice(0, 10) === iso);
    const label = chartDays <= 7
      ? DAY_LABELS[d.getUTCDay()]
      : chartDays <= 14
      ? `${DAY_LABELS[d.getUTCDay()].slice(0,1)} ${d.getUTCDate()}`
      : String(d.getUTCDate());
    return { label, count: row?.count ?? 0 };
  });

  const revenueAmount = Number(revenueRange?._sum.totalAmount ?? 0);

  return (
    <div className="min-h-full bg-[#f4f5f7]">

      {/* ── Filter bar ── */}
      <div className="flex items-center justify-end px-6 pt-5 pb-2 lg:px-8">
        <Suspense fallback={<div className="h-9 w-80 animate-pulse rounded-xl bg-rule" />}>
          <DashboardFilters
            branches={branches?.map((b) => ({ id: b.id, name: b.name }))}
          />
        </Suspense>
      </div>

      <div className="px-6 pb-8 pt-4 lg:px-8 space-y-5">

        {/* ── Row 1: Core order stat cards ── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label={rangeParam === "today" ? "Today's Orders" : "Orders"}
            value={rangeOrderCount}
            icon={<IcOrders />}
            sub={rangeParam === "today" ? "Created today" : rangeLabel}
            color="brand"
            href="/orders"
          />
          <StatCard
            label="In Progress"
            value={pendingCount}
            icon={<IcPending />}
            sub="Received · Confirmed · Preparing"
            color="gold"
            href="/orders?status=RECEIVED,CONFIRMED,PREPARING"
          />
          <StatCard
            label="Upcoming Deliveries"
            value={upcomingCount}
            icon={<IcDelivery />}
            sub="From today onwards"
            color="neutral"
            href={`/orders?delivery=${today.toISOString().slice(0, 10)}`}
          />
          <StatCard
            label="Unpaid"
            value={unpaidCount}
            icon={<IcUnpaid />}
            sub="Unpaid or partial"
            color="danger"
            href="/orders?payment=UNPAID,PARTIAL"
          />
        </div>

        {/* ── Row 2: Admin revenue + WA stats ── */}
        {isAdmin && (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Featured revenue card */}
            <div className="relative overflow-hidden rounded-2xl bg-brand p-5 lg:col-span-1">
              <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/5" />
              <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-white/5" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
                      {rangeParam === "today" ? "Revenue Today" : `Revenue — ${rangeLabel}`}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-white">{AED.format(revenueAmount)}</p>
                    <p className="mt-1 text-xs text-white/50">Non-cancelled orders</p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                    <IcRevenue className="h-5 w-5 text-gold" />
                  </div>
                </div>
                <Link href="/orders" className="mt-4 flex items-center gap-1 text-xs font-semibold text-gold hover:text-white transition">
                  View all orders
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              </div>
            </div>

            {/* WA Customers */}
            <div className="relative overflow-hidden rounded-2xl bg-[#128C7E] p-5">
              <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/5" />
              <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-white/5" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
                      {rangeParam === "today" ? "New WA Customers" : `WA Customers — ${rangeLabel}`}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-white">{waCustomers.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-white/50">Registered in period</p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                    <IcWA className="h-5 w-5 text-[#25D366]" />
                  </div>
                </div>
                <Link href="/customers" className="mt-4 flex items-center gap-1 text-xs font-semibold text-[#25D366] hover:text-white transition">
                  Manage customers
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              </div>
            </div>

            {/* Campaigns sent */}
            <div className="relative overflow-hidden rounded-2xl bg-[#075E54] p-5">
              <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/5" />
              <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-white/5" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
                      {rangeParam === "today" ? "Messages Sent Today" : `Messages Sent — ${rangeLabel}`}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-white">{waMsgSent.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-white/50">Via {waCampaignTotal} campaign{waCampaignTotal !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                    <IcCampaign className="h-5 w-5 text-[#25D366]" />
                  </div>
                </div>
                <Link href="/wa/campaigns" className="mt-4 flex items-center gap-1 text-xs font-semibold text-[#25D366] hover:text-white transition">
                  View campaign history
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Row 3: Chart + sidebar ── */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Orders this week chart */}
          <div className="rounded-2xl border border-rule bg-white p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-ink">
                  {rangeParam === "today" || rangeParam === "7d" ? "Orders This Week" : `Orders — ${rangeLabel}`}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">Daily order volume</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-brand" /> Peak
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-caramel opacity-75" /> Other days
                </span>
              </div>
            </div>
            <WeekChart bars={bars} />
          </div>

          {/* Recent WA campaigns */}
          <div className="rounded-2xl border border-rule bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-ink">Recent Campaigns</p>
              <Link href="/wa/campaigns" className="text-xs font-semibold text-caramel hover:text-brand transition">See all →</Link>
            </div>
            {recentCampaigns.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-ink-muted">No campaigns sent yet.</p>
                <Link href="/wa/templates" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-caramel hover:text-brand transition">
                  Send first campaign →
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {recentCampaigns.map((c, i) => {
                  const pct = c.total > 0 ? Math.round((c.sent / c.total) * 100) : 0;
                  return (
                    <li key={i} className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-ink">{c.template_name}</p>
                        <span className={["shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", pct === 100 ? "bg-success/10 text-success" : pct >= 50 ? "bg-amber-50 text-amber-700" : "bg-danger/10 text-danger"].join(" ")}>
                          {pct}%
                        </span>
                      </div>
                      <DeliveryBar sent={c.sent} failed={c.failed} />
                      <div className="flex items-center justify-between text-[10px] text-ink-muted">
                        <span>{c.sent} sent · {c.failed} failed</span>
                        <span>{new Date(c.created_at).toLocaleDateString("en-AE", { day: "2-digit", month: "short" })}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── Row 4: Recent orders + sidebar ── */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Recent orders table */}
          <div className="overflow-hidden rounded-2xl border border-rule bg-white lg:col-span-2">
            <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
              <div>
                <p className="text-sm font-bold text-ink">Recent Orders</p>
                <p className="text-xs text-ink-muted">
                  {rangeParam === "today" ? "Latest 8 orders today" : `Latest 8 — ${rangeLabel}`}
                </p>
              </div>
              <Link href="/orders" className="flex items-center gap-1 text-xs font-semibold text-caramel hover:text-brand transition">
                View all
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-cream">
                  <IcOrders className="h-5 w-5 text-caramel" />
                </div>
                <p className="text-sm font-semibold text-ink">No orders yet</p>
                <p className="mt-1 text-xs text-ink-muted">Hit New Order to get started.</p>
                <Link href="/new-order" className="mt-4 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-dark transition">
                  + New Order
                </Link>
              </div>
            ) : (
              <>
                {/* Desktop */}
                <table className="hidden w-full text-sm sm:table">
                  <thead className="bg-canvas text-left">
                    <tr>
                      {["Order", "Customer", "Branch", "Delivery", "Total", "Payment", "Status"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {recent.map((o) => (
                      <tr key={o.id} className="hover:bg-cream/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/orders/${o.trackingCode}`} className="font-mono text-xs font-bold text-brand hover:underline">
                            {o.orderNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{o.customerName}</td>
                        <td className="px-4 py-3 text-xs text-ink-muted">{o.branchName ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-ink-muted">
                          {o.deliveryDate.toISOString().slice(0, 10)} · {o.deliveryTime}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-ink">
                          {AED.format(Number(o.totalAmount ?? 0))}
                        </td>
                        <td className="px-4 py-3"><PaymentStatusBadge status={o.paymentStatus} /></td>
                        <td className="px-4 py-3"><OrderStatusBadge status={o.orderStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Mobile cards */}
                <ul className="divide-y divide-rule sm:hidden">
                  {recent.map((o) => (
                    <li key={o.id}>
                      <Link href={`/orders/${o.trackingCode}`} className="block px-4 py-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-brand">{o.orderNumber}</span>
                          <OrderStatusBadge status={o.orderStatus} />
                        </div>
                        <p className="text-sm font-medium text-ink">{o.customerName}</p>
                        <div className="flex items-center justify-between text-xs text-ink-muted">
                          <span>{o.branchName ?? "—"}</span>
                          <span>{o.deliveryDate.toISOString().slice(0, 10)} · {o.deliveryTime}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-ink">{AED.format(Number(o.totalAmount ?? 0))}</span>
                          <PaymentStatusBadge status={o.paymentStatus} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {/* Branches (admin) */}
            {isAdmin && branches && branches.length > 0 && (
              <div className="rounded-2xl border border-rule bg-white p-5">
                <p className="mb-3 text-sm font-bold text-ink">Branches</p>
                <ul className="space-y-2">
                  {branches.map((b) => {
                    const total = b.children.reduce((s, c) => s + c._count.orders, 0);
                    const pct = branches.reduce((s, br) => s + br.children.reduce((a, c) => a + c._count.orders, 0), 0);
                    const barW = pct > 0 ? Math.round((total / pct) * 100) : 0;
                    return (
                      <li key={b.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-ink">{b.name}</span>
                          <span className="font-semibold text-ink">{total}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-cream">
                          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${barW}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Quick actions */}
            <div className="rounded-2xl border border-rule bg-white p-5">
              <p className="mb-3 text-sm font-bold text-ink">Quick Actions</p>
              <div className="space-y-2">
                <QuickLink href="/new-order" icon={<IcPlus />} label="New Order" desc="Capture a customer request" accent />
                <QuickLink href="/orders" icon={<IcList />} label="Browse Orders" desc="Search, filter and manage" />
                <QuickLink href={`/orders?delivery=${today.toISOString().slice(0, 10)}`} icon={<IcTruck />} label="Today's Deliveries" desc="What's going out today" />
                <QuickLink href="/wa/templates" icon={<IcSend />} label="Send Campaign" desc="WhatsApp broadcast" />
                <QuickLink href="/wa/manage" icon={<IcTemplate />} label="Manage Templates" desc="Create & review templates" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, sub, color, href }: {
  label: string; value: number; icon: React.ReactNode;
  sub: string; color: "brand" | "gold" | "neutral" | "danger"; href: string;
}) {
  const colors = {
    brand:   { bg: "bg-brand/10",      iconColor: "text-brand",      num: "text-ink" },
    gold:    { bg: "bg-gold/10",        iconColor: "text-gold",        num: "text-gold" },
    neutral: { bg: "bg-cream",          iconColor: "text-brand",       num: "text-ink" },
    danger:  { bg: "bg-[#c62828]/10",   iconColor: "text-[#c62828]",   num: "text-[#c62828]" },
  }[color];

  return (
    <Link href={href} className="group flex items-center gap-4 rounded-2xl border border-rule bg-white px-5 py-4 transition-all hover:bg-cream/20 hover:border-caramel/50">
      <div className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", colors.bg].join(" ")}>
        <span className={colors.iconColor}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={["text-2xl font-bold tabular-nums tracking-tight", colors.num].join(" ")}>{value}</span>
          <span className="truncate text-sm font-semibold text-ink">{label}</span>
        </div>
        <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="h-4 w-4 shrink-0 text-rule transition group-hover:text-caramel">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </Link>
  );
}

// ── Quick link ────────────────────────────────────────────────────────────

function QuickLink({ href, icon, label, desc, accent }: {
  href: string; icon: React.ReactNode; label: string; desc: string; accent?: boolean;
}) {
  return (
    <Link href={href}
      className={["group flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition", accent ? "border-brand/30 bg-brand text-white hover:bg-brand-dark" : "border-rule bg-canvas text-ink hover:border-brand/30 hover:bg-cream/50"].join(" ")}>
      <span className={["shrink-0", accent ? "text-gold" : "text-caramel"].join(" ")}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={["text-xs font-semibold leading-none", accent ? "text-white" : "text-ink"].join(" ")}>{label}</p>
        <p className={["mt-0.5 truncate text-[10px] leading-none", accent ? "text-white/70" : "text-ink-muted"].join(" ")}>{desc}</p>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
        className={["h-3.5 w-3.5 shrink-0 transition group-hover:translate-x-0.5", accent ? "text-white/60" : "text-rule group-hover:text-caramel"].join(" ")}>
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </Link>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────

function IcOrders({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>;
}
function IcPending({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
}
function IcDelivery({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function IcUnpaid({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
}
function IcRevenue({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
}
function IcWA({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.528 5.849L.057 23.899a.75.75 0 00.921.921l6.05-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.857a9.834 9.834 0 01-5.032-1.381l-.36-.214-3.733.907.922-3.638-.235-.374A9.857 9.857 0 012.143 12C2.143 6.55 6.55 2.143 12 2.143S21.857 6.55 21.857 12 17.45 21.857 12 21.857z"/></svg>;
}
function IcCampaign({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
}
function IcPlus({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 5v14M5 12h14"/></svg>;
}
function IcList({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
}
function IcTruck({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function IcSend({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
}
function IcTemplate({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>;
}
