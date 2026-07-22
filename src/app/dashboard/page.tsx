import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { getPortalSettings } from "@/lib/portalSettings";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/orders/status-badges";
import { DashboardFilters } from "./filters";
import { OpenConversationsPanel } from "./OpenConversations";

export const dynamic = "force-dynamic";

const AED = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 0 });

function startOfDayUTC(d = new Date()) {
  const s = new Date(d); s.setUTCHours(0, 0, 0, 0); return s;
}

// ── Bar chart ─────────────────────────────────────────────────────────────

type DayBar = { label: string; count: number };

function WeekChart({ bars }: { bars: DayBar[] }) {
  const max = Math.max(...bars.map((b) => b.count), 1);
  const W = 500; const H = 100; const BAR_W = Math.min(32, Math.floor((W - 16) / bars.length) - 6);
  const GAP = Math.floor((W - bars.length * BAR_W) / (bars.length + 1));

  return (
    <svg viewBox={`0 0 ${W} ${H + 28}`} xmlns="http://www.w3.org/2000/svg" className="w-full">
      {bars.map((b, i) => {
        const barH = max === 0 ? 3 : Math.max(3, (b.count / max) * H);
        const x = GAP + i * (BAR_W + GAP);
        const y = H - barH;
        const isMax = b.count === max && b.count > 0;
        return (
          <g key={b.label}>
            <rect x={x} y={y} width={BAR_W} height={barH} rx={4}
              fill={isMax ? "#1e293b" : "#e2e8f0"} />
            {b.count > 0 && (
              <text x={x + BAR_W / 2} y={y - 5} textAnchor="middle" fontSize={9} fontWeight={600}
                fill={isMax ? "#1e293b" : "#9ca3af"}>
                {b.count}
              </text>
            )}
            <text x={x + BAR_W / 2} y={H + 18} textAnchor="middle" fontSize={10} fontWeight={500}
              fill="#9ca3af">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Delivery progress bar ─────────────────────────────────────────────────

function DeliveryBar({ sent, failed }: { sent: number; failed: number }) {
  const total = sent + failed;
  if (total === 0) return <div className="h-1 w-full rounded-full bg-[#f3f4f6]" />;
  const pct = Math.round((sent / total) * 100);
  return (
    <div className="flex h-1 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Date range ────────────────────────────────────────────────────────────

function getDateRange(range: string, from?: string, to?: string) {
  const today = startOfDayUTC();
  const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  if (range === "custom" && from && to) {
    const start = new Date(`${from}T00:00:00Z`);
    const end   = new Date(`${to}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
    const days  = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    return { start, end, label: `${from} → ${to}`, chartDays: Math.min(days, 60) };
  }
  switch (range) {
    case "yesterday": { const s = new Date(today); s.setUTCDate(s.getUTCDate() - 1); return { start: s, end: today, label: "Yesterday", chartDays: 7 }; }
    case "7d":        { const s = new Date(today); s.setUTCDate(s.getUTCDate() - 6); return { start: s, end: tomorrow, label: "Last 7 Days", chartDays: 7 }; }
    case "30d":       { const s = new Date(today); s.setUTCDate(s.getUTCDate() - 29); return { start: s, end: tomorrow, label: "Last 30 Days", chartDays: 30 }; }
    case "month": {
      const now = new Date();
      const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
      return { start: s, end: tomorrow, label: "This Month", chartDays: days };
    }
    default: return { start: today, end: tomorrow, label: "Today", chartDays: 7 };
  }
}

// ── Dashboard page ─────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // ── Agent-specific dashboard ───────────────────────────────────────────────
  if (user.role === "AGENT") {
    const WA_ONLY = { channel: "whatsapp" };
    const [openCount, pendingCount, resolvedTodayCount, unreadAgg, recentConvs] = await Promise.all([
      prisma.conversation.count({ where: { ...WA_ONLY, status: "OPEN" } }),
      prisma.conversation.count({ where: { ...WA_ONLY, status: "PENDING" } }),
      prisma.conversation.count({ where: { ...WA_ONLY, status: "RESOLVED", updatedAt: { gte: startOfDayUTC() } } }),
      prisma.conversation.aggregate({ _sum: { unreadCount: true }, where: { ...WA_ONLY, unreadCount: { gt: 0 } } }),
      prisma.conversation.findMany({
        where: { ...WA_ONLY, status: "OPEN" },
        orderBy: { lastMessageAt: "desc" },
        take: 8,
        select: { id: true, waId: true, customerName: true, lastMessageBody: true, lastMessageAt: true, unreadCount: true },
      }),
    ]);
    const totalUnread = unreadAgg._sum.unreadCount ?? 0;
    const firstName = user.name.split(" ")[0];
    const hour = new Date().getUTCHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    return (
      <div className="min-h-full">
        <div className="space-y-5 px-6 py-5 lg:px-8">
          <div>
            <h1 className="text-[18px] font-bold tracking-tight text-[#0f172a]">{greeting}, {firstName}</h1>
            <p className="mt-0.5 text-[12.5px] text-[#64748b]">Here&apos;s your conversation overview</p>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Open Conversations" value={openCount}        href="/wa/inbox" icon={<IcInbox />}    iconBg="bg-green-50"  iconColor="text-green-600" />
            <MetricCard label="Pending"             value={pendingCount}    href="/wa/inbox" icon={<IcPending />}  iconBg="bg-amber-50"  iconColor="text-amber-600" />
            <MetricCard label="Unread Messages"     value={totalUnread}     href="/wa/inbox" icon={<IcUnread />}   iconBg="bg-red-50"    iconColor="text-red-500"   valueColor={totalUnread > 0 ? "text-red-600" : undefined} />
            <MetricCard label="Resolved Today"      value={resolvedTodayCount} href="/wa/inbox" icon={<IcResolved />} iconBg="bg-blue-50" iconColor="text-blue-600" />
          </div>

          {/* Recent conversations + quick actions */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Recent open conversations */}
            <div className="overflow-hidden rounded-xl bg-[#f6f8fa] lg:col-span-2">
              <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
                <div>
                  <p className="text-[13.5px] font-semibold text-[#111827]">Open Conversations</p>
                  <p className="mt-0.5 text-[12px] text-[#9ca3af]">Most recently active</p>
                </div>
                <Link href="/wa/inbox" className="text-[12px] font-semibold text-[#64748b] hover:opacity-75 transition">Open Inbox →</Link>
              </div>
              {recentConvs.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#f3f4f6]">
                    <IcInbox className="h-5 w-5 text-[#9ca3af]" />
                  </div>
                  <p className="text-[13px] font-semibold text-[#111827]">No open conversations</p>
                  <p className="mt-1 text-[12px] text-[#9ca3af]">All caught up!</p>
                </div>
              ) : (
                <ul className="divide-y divide-[#ebebeb]">
                  {recentConvs.map((c) => (
                    <li key={c.id}>
                      <Link href="/wa/inbox" className="flex items-center gap-3 px-5 py-3 hover:bg-[#f0f2f5] transition-colors">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e2e8f0] text-[13px] font-semibold text-[#374151]">
                          {(c.customerName ?? "?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[13px] font-semibold text-[#111827]">{c.customerName ?? c.waId}</p>
                            <span className="shrink-0 text-[11px] text-[#9ca3af]">
                              {new Date(c.lastMessageAt).toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[12px] text-[#9ca3af]">{c.lastMessageBody ?? "—"}</p>
                        </div>
                        {c.unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white">
                            {c.unreadCount > 99 ? "99+" : c.unreadCount}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Quick actions */}
            <div className="rounded-xl bg-[#f6f8fa] p-5">
              <p className="mb-3 text-[13.5px] font-semibold text-[#111827]">Quick Actions</p>
              <div className="space-y-1.5">
                <QuickLink href="/wa/inbox"  icon={<IcUnread />}    label="Open Team Inbox"  desc="View active conversations" primary />
                <QuickLink href="/customers" icon={<IcCustomers />} label="View Customers"   desc="Browse all contacts" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const sp          = await searchParams;
  const rangeParam  = (typeof sp.range  === "string" ? sp.range  : "today");
  const branchParam = (typeof sp.branch === "string" ? sp.branch : "all");
  const fromParam   = (typeof sp.from   === "string" ? sp.from   : undefined);
  const toParam     = (typeof sp.to     === "string" ? sp.to     : undefined);

  const isAdmin      = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const scopeFilter  = {};

  const portalSettings = await getPortalSettings();
  const showPortal = isSuperAdmin || (user.role === "ADMIN" && portalSettings.portal_visible_to_admin) || user.role === "OPERATOR";

  const { start: rangeStart, end: rangeEnd, label: rangeLabel, chartDays } = getDateRange(rangeParam, fromParam, toParam);
  const today = startOfDayUTC();
  const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const branches = isAdmin
    ? await prisma.branch.findMany({
        where: { parentId: null, isActive: true }, orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, children: { where: { isActive: true }, select: { id: true, name: true, _count: { select: { orders: { where: { orderStatus: { not: "CANCELLED" } } } } } } } },
      })
    : null;

  const branchNameFilter: { branchName?: { in: string[] } } = {};
  if (isAdmin && branchParam !== "all" && branches) {
    const selected = branches.find((b) => b.id === branchParam);
    if (selected) branchNameFilter.branchName = { in: [selected.name, ...selected.children.map((c) => c.name)] };
  }

  const [rangeOrderCount, pendingCount, upcomingCount, unpaidCount, revenueRange, recent, chartOrdersRaw] = await Promise.all([
    prisma.order.count({ where: { ...scopeFilter, ...branchNameFilter, createdAt: { gte: rangeStart, lt: rangeEnd } } }),
    prisma.order.count({ where: { ...scopeFilter, orderStatus: { in: ["RECEIVED", "CONFIRMED", "PREPARING"] } } }),
    prisma.order.count({ where: { ...scopeFilter, deliveryDate: { gte: today }, orderStatus: { notIn: ["DELIVERED", "CANCELLED"] } } }),
    prisma.order.count({ where: { ...scopeFilter, paymentStatus: { in: ["UNPAID", "PARTIAL"] } } }),
    isAdmin ? prisma.order.aggregate({ _sum: { totalAmount: true }, where: { ...branchNameFilter, createdAt: { gte: rangeStart, lt: rangeEnd }, orderStatus: { not: "CANCELLED" } } }) : Promise.resolve(null),
    prisma.order.findMany({
      where: { ...scopeFilter, ...branchNameFilter, createdAt: { gte: rangeStart, lt: rangeEnd } },
      orderBy: { createdAt: "desc" }, take: 8,
      select: { id: true, orderNumber: true, trackingCode: true, customerName: true, branchName: true, deliveryDate: true, deliveryTime: true, totalAmount: true, paymentStatus: true, orderStatus: true },
    }),
    prisma.$queryRaw<{ day: Date; count: number }[]>`
      SELECT DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC') AS day, COUNT(*)::int AS count
      FROM "Order" WHERE "createdAt" >= ${rangeStart} GROUP BY day ORDER BY day
    `,
  ]);

  const [waLeadsTotal, waLeadsNew, waLeadsConverted] = await Promise.all([
    prisma.whatsappLead.count(),
    prisma.whatsappLead.count({ where: { status: "NEW" } }),
    prisma.whatsappLead.count({ where: { status: "CONVERTED" } }),
  ]);

  const [waActiveConversations, waPendingConversations, waResolvedConversations, waUnread, waRecentConversations] = await Promise.all([
    prisma.conversation.count({ where: { status: "OPEN" } }),
    prisma.conversation.count({ where: { status: "PENDING" } }),
    prisma.conversation.count({ where: { status: "RESOLVED" } }),
    prisma.conversation.aggregate({ _sum: { unreadCount: true }, where: { unreadCount: { gt: 0 } } }),
    prisma.conversation.findMany({ where: { status: "OPEN" }, orderBy: { lastMessageAt: "desc" }, take: 6, select: { id: true, waId: true, customerName: true, lastMessageBody: true, lastMessageAt: true, unreadCount: true } }),
  ]);
  const waTotalUnread = waUnread._sum.unreadCount ?? 0;

  let waCustomers = 0, waMsgSent = 0;
  let recentCampaigns: { template_name: string; sent: number; failed: number; total: number; created_at: string }[] = [];
  try {
    const { botQuery } = await import("@/lib/botdb");
    await botQuery(`CREATE TABLE IF NOT EXISTS campaign_logs (id SERIAL PRIMARY KEY, template_name TEXT NOT NULL, template_language TEXT NOT NULL, total INTEGER NOT NULL, sent INTEGER NOT NULL, failed INTEGER NOT NULL, results JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
    const [campR, recR] = await Promise.all([
      botQuery("SELECT COUNT(*)::int AS n, COALESCE(SUM(sent),0)::int AS s FROM campaign_logs WHERE created_at >= $1 AND created_at < $2", [rangeStart.toISOString(), rangeEnd.toISOString()]),
      botQuery("SELECT template_name, sent, failed, total, created_at FROM campaign_logs WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at DESC LIMIT 5", [rangeStart.toISOString(), rangeEnd.toISOString()]),
    ]);
    waMsgSent       = campR.rows[0]?.s ?? 0;
    recentCampaigns = recR.rows as typeof recentCampaigns;
    try {
      const cols = await botQuery(`SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'created_at'`);
      const hasCratedAt = (cols.rowCount ?? 0) > 0;
      const custR = hasCratedAt
        ? await botQuery("SELECT COUNT(*)::int AS n FROM customers WHERE created_at >= $1 AND created_at < $2", [rangeStart.toISOString(), rangeEnd.toISOString()])
        : await botQuery("SELECT COUNT(*)::int AS n FROM customers");
      waCustomers = custR.rows[0]?.n ?? 0;
    } catch { /* customers table unavailable */ }
  } catch { /* bot DB unavailable */ }

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const bars: DayBar[] = Array.from({ length: chartDays }, (_, i) => {
    const d = new Date(rangeStart); d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const row = chartOrdersRaw.find((r) => new Date(r.day).toISOString().slice(0, 10) === iso);
    const label = chartDays <= 7 ? DAY_LABELS[d.getUTCDay()] : chartDays <= 14 ? `${DAY_LABELS[d.getUTCDay()].slice(0,1)} ${d.getUTCDate()}` : String(d.getUTCDate());
    return { label, count: row?.count ?? 0 };
  });

  const revenueAmount = Number(revenueRange?._sum.totalAmount ?? 0);
  const firstName = user.name.split(" ")[0];
  const hour = new Date().getUTCHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="min-h-full">
      <div className="space-y-5 px-6 py-5 lg:px-8">

        {/* ── Header: greeting + filters ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[18px] font-bold tracking-tight text-[#0f172a]">{greeting}, {firstName}</h1>
            <p className="mt-0.5 text-[12.5px] text-[#64748b]">{rangeLabel} · Here&apos;s your overview</p>
          </div>
          <Suspense fallback={<div className="h-9 w-80 animate-pulse rounded-lg bg-[#f3f4f6]" />}>
            <DashboardFilters branches={showPortal ? branches?.map((b) => ({ id: b.id, name: b.name })) : undefined} />
          </Suspense>
        </div>

        {/* ── Row 1: Portal order stats (portal users only) ── */}
        {showPortal && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label={rangeParam === "today" ? "Orders Today" : "Orders"}
              value={rangeOrderCount}
              href="/orders"
              icon={<IcOrders />}
              iconBg="bg-blue-50" iconColor="text-blue-600"
            />
            <MetricCard
              label="In Progress"
              value={pendingCount}
              href="/orders?status=RECEIVED,CONFIRMED,PREPARING"
              icon={<IcPending />}
              iconBg="bg-amber-50" iconColor="text-amber-600"
            />
            <MetricCard
              label="Upcoming Deliveries"
              value={upcomingCount}
              href={`/orders?delivery=${today.toISOString().slice(0, 10)}`}
              icon={<IcDelivery />}
              iconBg="bg-slate-100" iconColor="text-slate-500"
            />
            <MetricCard
              label="Unpaid"
              value={unpaidCount}
              href="/orders?payment=UNPAID,PARTIAL"
              icon={<IcUnpaid />}
              iconBg="bg-red-50" iconColor="text-red-500"
              valueColor="text-red-600"
            />
          </div>
        )}

        {/* ── Row 2a: Admin + portal — Revenue + WA summary (4 cards) ── */}
        {isAdmin && showPortal && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label={rangeParam === "today" ? "Revenue Today" : `Revenue`}
              value={AED.format(revenueAmount)}
              href="/orders"
              icon={<IcRevenue />}
              iconBg="bg-blue-50" iconColor="text-blue-600"
              sub="Non-cancelled orders"
            />
            <MetricCard
              label="New Contacts"
              value={waCustomers}
              href="/customers"
              icon={<IcWA />}
              iconBg="bg-green-50" iconColor="text-green-600"
            />
            <MetricCard
              label="Messages Sent"
              value={waMsgSent}
              href="/wa/campaigns"
              icon={<IcCampaign />}
              iconBg="bg-emerald-50" iconColor="text-emerald-600"
            />
            <MetricCard
              label="WhatsApp Leads"
              value={waLeadsTotal}
              href="/wa/leads"
              icon={<IcLeads />}
              iconBg="bg-violet-50" iconColor="text-violet-600"
              sub={`${waLeadsNew} new · ${waLeadsConverted} converted`}
            />
          </div>
        )}

        {/* ── Row 2b: Admin WA-only — 4 WA cards (no portal) ── */}
        {isAdmin && !showPortal && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label="New Contacts"
              value={waCustomers}
              href="/customers"
              icon={<IcWA />}
              iconBg="bg-green-50" iconColor="text-green-600"
            />
            <MetricCard
              label="Messages Sent"
              value={waMsgSent}
              href="/wa/campaigns"
              icon={<IcCampaign />}
              iconBg="bg-emerald-50" iconColor="text-emerald-600"
            />
            <MetricCard
              label="WhatsApp Leads"
              value={waLeadsTotal}
              href="/wa/leads"
              icon={<IcLeads />}
              iconBg="bg-violet-50" iconColor="text-violet-600"
              sub={`${waLeadsNew} new · ${waLeadsConverted} converted`}
            />
            <MetricCard
              label="Active Conversations"
              value={waActiveConversations}
              href="/wa/inbox"
              icon={<IcInbox />}
              iconBg="bg-blue-50" iconColor="text-blue-600"
            />
          </div>
        )}

        {/* ── Row 3: Chart + campaigns ── */}
        <div className="grid gap-4 lg:grid-cols-3">

          {showPortal && (
            <div className="rounded-xl bg-[#f6f8fa] lg:col-span-2">
              <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
                <div>
                  <p className="text-[13.5px] font-semibold text-[#111827]">
                    {rangeParam === "today" || rangeParam === "7d" ? "Orders This Week" : `Orders — ${rangeLabel}`}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#9ca3af]">Daily order volume</p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[#9ca3af]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-[#1e293b]" /> Peak
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-[#dbeafe]" /> Other
                  </span>
                </div>
              </div>
              <div className="px-4 pb-4 pt-3">
                <WeekChart bars={bars} />
              </div>
            </div>
          )}

          {/* Recent campaigns */}
          <div className={["rounded-xl bg-[#f6f8fa]", !showPortal ? "lg:col-span-2" : ""].join(" ")}>
            <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
              <p className="text-[13.5px] font-semibold text-[#111827]">Recent Campaigns</p>
              <Link href="/wa/campaigns" className="text-[12px] font-semibold text-[#64748b] hover:opacity-75 transition">
                See all →
              </Link>
            </div>
            <div className="p-5">
              {recentCampaigns.length === 0 ? (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f3f4f6]">
                    <IcCampaign className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                  <p className="text-[13px] font-medium text-[#6b7280]">No campaigns sent yet</p>
                  <Link href="/wa/templates" className="mt-2 inline-block text-[12px] font-semibold text-[#64748b] hover:opacity-75 transition">
                    Send first campaign →
                  </Link>
                </div>
              ) : (
                <ul className="space-y-4">
                  {recentCampaigns.map((c, i) => {
                    const pct = c.total > 0 ? Math.round((c.sent / c.total) * 100) : 0;
                    return (
                      <li key={i} className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-[12.5px] font-semibold text-[#111827]">{c.template_name}</p>
                          <span className={["shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums",
                            pct === 100 ? "bg-emerald-50 text-emerald-700"
                            : pct >= 50  ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-600"
                          ].join(" ")}>
                            {pct}%
                          </span>
                        </div>
                        <DeliveryBar sent={c.sent} failed={c.failed} />
                        <div className="flex items-center justify-between text-[11px] text-[#9ca3af]">
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

          {!showPortal && (
            <OpenConversationsPanel initial={waRecentConversations.map((c) => ({ ...c, lastMessageAt: c.lastMessageAt.toISOString() }))} />
          )}
        </div>

        {/* ── Row 4: Recent orders + sidebar ── */}
        <div className={["grid gap-4", showPortal ? "lg:grid-cols-3" : "lg:grid-cols-4"].join(" ")}>

          {/* Recent orders */}
          {showPortal && (
            <div className="overflow-hidden rounded-xl bg-[#f6f8fa] lg:col-span-2">
              <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
                <div>
                  <p className="text-[13.5px] font-semibold text-[#111827]">Recent Orders</p>
                  <p className="mt-0.5 text-[12px] text-[#9ca3af]">
                    {rangeParam === "today" ? "Latest 8 orders today" : `Latest 8 — ${rangeLabel}`}
                  </p>
                </div>
                <Link href="/orders" className="text-[12px] font-semibold text-[#64748b] hover:opacity-75 transition">
                  View all →
                </Link>
              </div>

              {recent.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#f3f4f6]">
                    <IcOrders className="h-5 w-5 text-[#9ca3af]" />
                  </div>
                  <p className="text-[13px] font-semibold text-[#111827]">No orders yet</p>
                  <p className="mt-1 text-[12px] text-[#9ca3af]">Hit New Order to get started.</p>
                  <Link href="/new-order" className="mt-4 rounded-lg bg-[#0f172a] px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 transition">
                    + New Order
                  </Link>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <table className="hidden w-full text-sm sm:table">
                    <thead>
                      <tr className="border-b border-[#ebebeb] bg-[#f6f8fa]">
                        {["Order", "Customer", "Branch", "Delivery", "Total", "Payment", "Status"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-[#9ca3af]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ebebeb]">
                      {recent.map((o) => (
                        <tr key={o.id} className="hover:bg-[#f0f2f5] transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/orders/${o.trackingCode}`} className="font-mono text-[12px] font-bold text-[#374151] hover:underline">
                              {o.orderNumber}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-[13px] font-medium text-[#111827]">{o.customerName}</td>
                          <td className="px-4 py-3 text-[12px] text-[#9ca3af]">{o.branchName ?? "—"}</td>
                          <td className="px-4 py-3 text-[12px] text-[#9ca3af]">
                            {o.deliveryDate.toISOString().slice(0, 10)} · {o.deliveryTime}
                          </td>
                          <td className="px-4 py-3 text-right text-[13px] font-semibold text-[#111827]">
                            {AED.format(Number(o.totalAmount ?? 0))}
                          </td>
                          <td className="px-4 py-3"><PaymentStatusBadge status={o.paymentStatus} /></td>
                          <td className="px-4 py-3"><OrderStatusBadge status={o.orderStatus} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Mobile cards */}
                  <ul className="divide-y divide-[#ebebeb] sm:hidden">
                    {recent.map((o) => (
                      <li key={o.id}>
                        <Link href={`/orders/${o.trackingCode}`} className="block space-y-1.5 px-4 py-3">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[12px] font-bold text-[#374151]">{o.orderNumber}</span>
                            <OrderStatusBadge status={o.orderStatus} />
                          </div>
                          <p className="text-[13px] font-medium text-[#111827]">{o.customerName}</p>
                          <div className="flex items-center justify-between text-[12px] text-[#9ca3af]">
                            <span>{o.branchName ?? "—"}</span>
                            <span>{o.deliveryDate.toISOString().slice(0, 10)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-bold text-[#111827]">{AED.format(Number(o.totalAmount ?? 0))}</span>
                            <PaymentStatusBadge status={o.paymentStatus} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* Right column */}
          <div className={["space-y-4", !showPortal ? "lg:col-span-4 grid grid-cols-1 lg:grid-cols-2 gap-4 space-y-0" : ""].join(" ")}>

            {/* Branches */}
            {showPortal && isAdmin && branches && branches.length > 0 && (
              <div className="rounded-xl bg-[#f6f8fa] p-5">
                <p className="mb-4 text-[13.5px] font-semibold text-[#111827]">Branches</p>
                <ul className="space-y-3">
                  {branches.map((b) => {
                    const total = b.children.reduce((s, c) => s + c._count.orders, 0);
                    const allOrders = branches.reduce((s, br) => s + br.children.reduce((a, c) => a + c._count.orders, 0), 0);
                    const barW = allOrders > 0 ? Math.round((total / allOrders) * 100) : 0;
                    return (
                      <li key={b.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[12.5px] font-medium text-[#374151]">{b.name}</span>
                          <span className="text-[12.5px] font-semibold tabular-nums text-[#111827]">{total}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
                          <div className="h-full rounded-full bg-[#1e293b] transition-all" style={{ width: `${barW}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Quick actions */}
            <div className="rounded-xl bg-[#f6f8fa] p-5">
              <p className="mb-3 text-[13.5px] font-semibold text-[#111827]">Quick Actions</p>
              <div className="space-y-1.5">
                {showPortal && <QuickLink href="/new-order"       icon={<IcPlus />}     label="New Order"          desc="Capture a customer request"  primary />}
                {showPortal && <QuickLink href="/orders"          icon={<IcList />}     label="Browse Orders"      desc="Search, filter and manage" />}
                {showPortal && <QuickLink href={`/orders?delivery=${today.toISOString().slice(0, 10)}`} icon={<IcTruck />} label="Today's Deliveries" desc="What's going out today" />}
                <QuickLink href="/wa/templates" icon={<IcSend />}     label="Send Campaign"      desc="WhatsApp broadcast" />
                <QuickLink href="/wa/inbox"     icon={<IcUnread />}   label="Open Inbox"         desc="View active conversations" />
                <QuickLink href="/wa/manage"    icon={<IcTemplate />} label="Manage Templates"   desc="Create & review templates" />
              </div>
            </div>

            {/* Conversation status — WA-only users */}
            {!showPortal && (
              <div className="rounded-xl bg-[#f6f8fa] p-5">
                <p className="mb-4 text-[13.5px] font-semibold text-[#111827]">Conversation Status</p>
                <ConversationDonut open={waActiveConversations} pending={waPendingConversations} resolved={waResolvedConversations} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────

function MetricCard({ label, value, href, icon, iconBg, iconColor, valueColor, sub }: {
  label: string; value: number | string; href: string;
  icon: React.ReactNode; iconBg: string; iconColor: string;
  valueColor?: string; sub?: string;
}) {
  return (
    <Link href={href}
      className="group flex flex-col gap-3 rounded-xl bg-[#f6f8fa] p-5 transition hover:bg-[#f0f2f5]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium leading-snug text-[#6b7280]">{label}</p>
        <div className={["flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconBg].join(" ")}>
          <span className={["[&>svg]:h-4 [&>svg]:w-4", iconColor].join(" ")}>{icon}</span>
        </div>
      </div>
      <p className={["text-[26px] font-bold tabular-nums tracking-tight leading-none", valueColor ?? "text-[#111827]"].join(" ")}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-[11.5px] text-[#9ca3af]">{sub}</p>}
    </Link>
  );
}

// ── Quick link ────────────────────────────────────────────────────────────

function QuickLink({ href, icon, label, desc, primary }: { href: string; icon: React.ReactNode; label: string; desc: string; primary?: boolean }) {
  return (
    <Link href={href}
      className={["group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
        primary
          ? "border-[#0f172a] bg-[#0f172a] hover:bg-[#1e293b] hover:border-[#1e293b]"
          : "border-[#e9ecef] bg-white hover:bg-[#f9fafb] hover:border-[#e2e5e8]",
      ].join(" ")}
    >
      <span className={["shrink-0 [&>svg]:h-4 [&>svg]:w-4", primary ? "text-white/80" : "text-[#9ca3af] group-hover:text-[#6b7280]"].join(" ")}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={["text-[12.5px] font-semibold leading-tight", primary ? "text-white" : "text-[#111827]"].join(" ")}>{label}</p>
        <p className={["mt-0.5 truncate text-[11px] leading-tight", primary ? "text-white/65" : "text-[#9ca3af]"].join(" ")}>{desc}</p>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
        className={["h-3 w-3 shrink-0 transition-transform group-hover:translate-x-0.5", primary ? "text-white/60" : "text-[#d1d5db]"].join(" ")} aria-hidden="true">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}

// ── Conversation donut ────────────────────────────────────────────────────

function ConversationDonut({ open, pending, resolved }: { open: number; pending: number; resolved: number }) {
  const total = open + pending + resolved;
  const R = 54; const cx = 80; const cy = 80; const strokeW = 16;
  const circ = 2 * Math.PI * R;
  const segments = [
    { label: "Open",     value: open,     color: "#22c55e" },
    { label: "Pending",  value: pending,  color: "#f59e0b" },
    { label: "Resolved", value: resolved, color: "#e5e7eb" },
  ];
  let cumulative = 0;
  const arcs = segments.map((seg) => {
    const pct = total > 0 ? seg.value / total : 0;
    const gap = total > 0 ? 2 : 0;
    const dash = Math.max(0, pct * circ - gap);
    const rot = -90 + (cumulative / (total || 1)) * 360;
    cumulative += seg.value;
    return { ...seg, dash, space: circ - dash, rot };
  });
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg viewBox="0 0 160 160" className="h-32 w-32">
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f3f4f6" strokeWidth={strokeW} />
          {total === 0 ? null : arcs.map((a, i) => (
            <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={a.color} strokeWidth={strokeW}
              strokeDasharray={`${a.dash} ${a.space}`} strokeLinecap="butt"
              transform={`rotate(${a.rot} ${cx} ${cy})`} />
          ))}
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize={22} fontWeight={700} fill="#111827">{total}</text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fontWeight={500} fill="#9ca3af">Total</text>
        </svg>
      </div>
      <div className="flex-1 space-y-3">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
          return (
            <div key={seg.label} className="space-y-1">
              <div className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-1.5 text-[#6b7280]">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                  {seg.label}
                </span>
                <span className="font-semibold tabular-nums text-[#111827]">{seg.value} <span className="font-normal text-[#9ca3af]">({pct}%)</span></span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: seg.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────

function IcOrders({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>;
}
function IcPending({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
}
function IcDelivery({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function IcUnpaid({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
}
function IcRevenue({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
}
function IcWA({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.528 5.849L.057 23.899a.75.75 0 00.921.921l6.05-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.857a9.834 9.834 0 01-5.032-1.381l-.36-.214-3.733.907.922-3.638-.235-.374A9.857 9.857 0 012.143 12C2.143 6.55 6.55 2.143 12 2.143S21.857 6.55 21.857 12 17.45 21.857 12 21.857z"/></svg>;
}
function IcCampaign({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
}
function IcLeads({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
}
function IcInbox({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
}
function IcUnread({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/></svg>;
}
function IcPlus({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 5v14M5 12h14"/></svg>;
}
function IcList({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
}
function IcTruck({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function IcSend({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
}
function IcTemplate({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>;
}
function IcResolved({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
}
function IcCustomers({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
}
