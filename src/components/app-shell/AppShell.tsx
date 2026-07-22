"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement, type SVGProps } from "react";
import { SearchBar } from "./SearchBar";

type Role = "SUPER_ADMIN" | "ADMIN" | "AGENT" | "OPERATOR";

// ── Page title map ─────────────────────────────────────────────────────────

const PAGE_TITLES: Record<string, { title: string; parent?: string; parentHref?: string }> = {
  "/dashboard":           { title: "Dashboard" },
  "/new-order":           { title: "New Order",         parent: "Orders",       parentHref: "/orders" },
  "/orders":              { title: "Orders" },
  "/admin/branches":      { title: "Branches",           parent: "Admin",        parentHref: "/admin/settings" },
  "/admin/users":         { title: "Users",              parent: "Admin",        parentHref: "/admin/settings" },
  "/admin/settings":      { title: "Configuration",      parent: "Admin",        parentHref: "/dashboard" },
  "/admin/integrations":  { title: "Integrations",       parent: "Admin",        parentHref: "/admin/settings" },
  "/admin/quick-replies": { title: "Quick Replies",      parent: "WhatsApp",     parentHref: "/wa/inbox" },
  "/customers":           { title: "Customers",          parent: "WhatsApp",     parentHref: "/wa/inbox" },
  "/wa/templates":        { title: "Send Campaign",      parent: "WhatsApp",     parentHref: "/wa/inbox" },
  "/wa/campaigns":        { title: "Campaign History",   parent: "WhatsApp",     parentHref: "/wa/inbox" },
  "/wa/manage":           { title: "Manage Templates",   parent: "WhatsApp",     parentHref: "/wa/inbox" },
  "/wa/settings":         { title: "Channel Settings",   parent: "WhatsApp",     parentHref: "/wa/inbox" },
  "/wa/inbox":            { title: "Team Inbox",         parent: "WhatsApp",     parentHref: "/dashboard" },
  "/wa/woocommerce":      { title: "WooCommerce",        parent: "Integrations", parentHref: "/admin/integrations" },
  "/wa/shopify":          { title: "Shopify",             parent: "Integrations", parentHref: "/admin/integrations" },
  "/wa/flows":            { title: "Flow Builder",       parent: "WhatsApp",     parentHref: "/wa/inbox" },
  "/wa/leads":              { title: "WA Leads",           parent: "WhatsApp",     parentHref: "/wa/inbox" },
  "/admin/reports/agents":  { title: "Agent Report",       parent: "Admin",        parentHref: "/admin/settings" },
  "/operator":              { title: "Order Queue",         parent: "Portal",       parentHref: "/dashboard" },
};

function getPageMeta(pathname: string) {
  const exact = PAGE_TITLES[pathname];
  if (exact) return exact;
  const partial = Object.entries(PAGE_TITLES).find(([k]) => k !== "/" && pathname.startsWith(k + "/"));
  return partial?.[1] ?? { title: "Portal" };
}

// ── Nav config ─────────────────────────────────────────────────────────────

type NavItem = {
  href: string; label: string;
  roles: readonly Role[];
  icon: (p: SVGProps<SVGSVGElement>) => ReactElement;
};

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["SUPER_ADMIN","ADMIN","OPERATOR","AGENT"], icon: IcDashboard },
];

const PORTAL_NAV: NavItem[] = [
  { href: "/new-order",      label: "New Order",   roles: ["SUPER_ADMIN","ADMIN"],            icon: IcPlus },
  { href: "/orders",         label: "Orders",      roles: ["SUPER_ADMIN","ADMIN","OPERATOR"], icon: IcOrders },
  { href: "/operator",       label: "Order Queue", roles: ["SUPER_ADMIN","ADMIN","OPERATOR"],         icon: IcQueue },
  { href: "/admin/branches", label: "Branches",    roles: ["SUPER_ADMIN","ADMIN"],                    icon: IcBranch },
];

const SETTINGS_NAV: NavItem[] = [
  { href: "/admin/users",           label: "Users",         roles: ["SUPER_ADMIN", "ADMIN"],  icon: IcUsers },
  { href: "/admin/settings",        label: "Configuration", roles: ["SUPER_ADMIN"],           icon: IcPortalSettings },
  { href: "/admin/integrations",    label: "Integrations",  roles: ["SUPER_ADMIN"],           icon: IcIntegrations },
  { href: "/admin/reports/agents",  label: "Agent Report",  roles: ["SUPER_ADMIN", "ADMIN"],  icon: IcReport },
];

const WA_NAV: NavItem[] = [
  { href: "/wa/inbox",            label: "Team Inbox",       icon: IcInbox,      roles: ["SUPER_ADMIN","ADMIN","AGENT"] },
  { href: "/customers",           label: "Customers",        icon: IcCustomers,  roles: ["SUPER_ADMIN","ADMIN","AGENT"] },
  { href: "/admin/quick-replies", label: "Quick Replies",    icon: IcQuickReply, roles: ["SUPER_ADMIN","ADMIN"] },
  { href: "/wa/templates",        label: "Send Campaign",    icon: IcSend,       roles: ["SUPER_ADMIN","ADMIN"] },
  { href: "/wa/campaigns",        label: "Campaign History", icon: IcHistory,    roles: ["SUPER_ADMIN","ADMIN"] },
  { href: "/wa/manage",           label: "Manage Templates", icon: IcTemplate,   roles: ["SUPER_ADMIN","ADMIN"] },
  { href: "/wa/settings",         label: "Channel Settings", icon: IcSettings,   roles: ["SUPER_ADMIN","ADMIN"] },
  { href: "/wa/flows",            label: "Flow Builder",     icon: IcFlow,       roles: ["SUPER_ADMIN","ADMIN"] },
  { href: "/wa/leads",            label: "WA Leads",         icon: IcLeads,      roles: ["SUPER_ADMIN","ADMIN"] },
];

const WOO_NAV = [
  { href: "/wa/woocommerce", label: "WooCommerce", icon: IcWoo },
];

const SHOPIFY_NAV = [
  { href: "/wa/shopify", label: "Shopify", icon: IcShopify },
];

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN:       "Admin",
  AGENT:       "Agent",
  OPERATOR:    "Operator",
};

// ── Types ──────────────────────────────────────────────────────────────────

type Settings = {
  woo_visible_to_admin:          boolean;
  shopify_visible_to_admin:      boolean;
  wa_visible_to_admin:           boolean;
  portal_visible_to_admin:       boolean;
  integrations_visible_to_admin: boolean;
  app_name?:        string;
  logo_url?:        string;
  woo_configured:     boolean;
  shopify_configured: boolean;
};

// ── Shared nav link component ──────────────────────────────────────────────

function NavLink({
  href, label, icon: Icon, active, badge, accent,
}: {
  href: string; label: string;
  icon: (p: SVGProps<SVGSVGElement>) => ReactElement;
  active: boolean; badge?: number;
  accent?: { activeBg: string; activeText: string; hoverBg: string; iconColor: string };
}) {
  const def = {
    activeBg:   "bg-white",
    activeText: "text-[#111827]",
    hoverBg:    "hover:bg-white",
    iconColor:  active ? "text-[#111827]" : "text-[#6b7280]",
  };
  const a = accent ?? def;

  return (
    <Link
      href={href}
      className={[
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? `${a.activeBg} ${a.activeText}`
          : `text-[#374151] ${a.hoverBg} hover:text-[#111827]`,
      ].join(" ")}
    >
      <Icon className={["h-4 w-4 shrink-0 transition-colors", active ? a.iconColor : `text-[#6b7280] group-hover:text-[#374151]`].join(" ")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && !active && (
        <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="mb-0.5 mt-2.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-widest text-[#9ca3af]">
      {label}
    </p>
  );
}

// ── AppShell ───────────────────────────────────────────────────────────────

export default function AppShell({
  user, children, settings,
}: {
  user: { id: string; name: string; role: Role };
  children: React.ReactNode;
  settings?: Settings;
}) {
  const pathname = usePathname();
  const router   = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signing,     setSigning]     = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [navPct,  setNavPct]  = useState(0);
  const [navShow, setNavShow] = useState(false);
  const navMounted = useRef(false);
  const navTick    = useRef<ReturnType<typeof setInterval> | null>(null);
  const navDone    = useRef<ReturnType<typeof setTimeout>  | null>(null);

  // Nav progress bar
  function startNav() {
    if (navTick.current) clearInterval(navTick.current);
    if (navDone.current) clearTimeout(navDone.current);
    setNavPct(0); setNavShow(true);
    let pct = 0;
    navTick.current = setInterval(() => { pct += (85 - pct) * 0.08; setNavPct(Math.min(pct, 85)); }, 60);
  }
  function finishNav() {
    if (navTick.current) { clearInterval(navTick.current); navTick.current = null; }
    setNavPct(100);
    navDone.current = setTimeout(() => { setNavShow(false); setNavPct(0); }, 380);
  }

  useEffect(() => {
    setSidebarOpen(false);
    if (!navMounted.current) { navMounted.current = true; return; }
    finishNav();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    function onLinkClick(e: MouseEvent) {
      const anchor = (e.target as Element).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto") || href === "#") return;
      if (href === pathname) return;
      startNav();
    }
    document.addEventListener("click", onLinkClick, true);
    return () => document.removeEventListener("click", onLinkClick, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Poll unread count
  useEffect(() => {
    if (!waNavItems.some((i) => i.href === "/wa/inbox")) return;
    function fetchUnread() {
      fetch("/api/inbox/unread-count")
        .then((r) => r.json())
        .then((j: { ok: boolean; data: { count: number } }) => { if (j.ok) setInboxUnread(j.data.count); })
        .catch(() => {});
    }
    fetchUnread();
    const t = setInterval(fetchUnread, 10000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = inboxUnread > 0 ? `(${inboxUnread}) ${base}` : base;
  }, [inboxUnread]);

  const appName = settings?.app_name ?? "Order Portal";
  const logoUrl = settings?.logo_url ?? "/uploads/logo.png";

  const waNavItems      = WA_NAV.filter((i) => i.roles.includes(user.role));
  const isSuperAdmin    = user.role === "SUPER_ADMIN";
  const showWoo         = (settings?.woo_configured     ?? false) && (isSuperAdmin || (user.role === "ADMIN" && (settings?.woo_visible_to_admin     ?? false)));
  const showShopify     = (settings?.shopify_configured ?? false) && (isSuperAdmin || (user.role === "ADMIN" && (settings?.shopify_visible_to_admin ?? false)));
  const showWA          = isSuperAdmin || user.role === "AGENT"    || (user.role === "ADMIN" && (settings?.wa_visible_to_admin           ?? true));
  const showPortal      = isSuperAdmin || user.role === "OPERATOR" || (user.role === "ADMIN" && (settings?.portal_visible_to_admin ?? true));
  const showIntegrations = isSuperAdmin || (user.role === "ADMIN" && (settings?.integrations_visible_to_admin ?? false));

  const mainItems     = MAIN_NAV.filter((i) => i.roles.includes(user.role));
  const portalItems   = PORTAL_NAV.filter((i) => i.roles.includes(user.role));
  const settingsItems = SETTINGS_NAV.filter((i) =>
    i.href === "/admin/integrations" ? showIntegrations : i.roles.includes(user.role)
  );

  const meta     = getPageMeta(pathname);
  const initials = user.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const isFlowEditor = /^\/wa\/flows\/\d+/.test(pathname);

  function isActive(href: string) {
    if (href === "/orders") return pathname === "/orders" || (pathname.startsWith("/orders/") && !pathname.startsWith("/orders/new"));
    return pathname === href || pathname.startsWith(href + "/");
  }

  async function signOut() {
    if (signing) return;
    setSigning(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    router.replace("/login");
    router.refresh();
  }

  // ── Sidebar content ───────────────────────────────────────────────────────
  const sidebar = (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col border-r border-[#e5e7eb] bg-[#f6f8fa]",
        "transform transition-transform duration-200 ease-out",
        "sm:sticky sm:top-0 sm:h-screen sm:translate-x-0 sm:z-auto",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}
    >
      {/* Logo */}
      <div className="flex h-[56px] shrink-0 items-center border-b border-[#e5e7eb] px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={appName} className="h-8 w-auto" />
      </div>

      {/* Nav */}
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2.5">

        {/* Dashboard */}
        <div className="space-y-0.5">
          {mainItems.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActive(item.href)} />
          ))}
        </div>

        {/* Portal */}
        {showPortal && portalItems.length > 0 && (
          <div className="space-y-0.5">
            <SectionLabel label="Portal" />
            {portalItems.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActive(item.href)} />
            ))}
          </div>
        )}

        {/* WhatsApp Business */}
        {waNavItems.length > 0 && showWA && (
          <div className="space-y-0.5">
            <div className="mb-0.5 mt-2.5 flex items-center gap-1.5 px-2.5">
              <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" aria-hidden="true">
                <path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path fill="#25D366" d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.528 5.849L.057 23.899a.75.75 0 00.921.921l6.05-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.857a9.834 9.834 0 01-5.032-1.381l-.36-.214-3.733.907.922-3.638-.235-.374A9.857 9.857 0 012.143 12C2.143 6.55 6.55 2.143 12 2.143S21.857 6.55 21.857 12 17.45 21.857 12 21.857z"/>
              </svg>
              <span className="text-[10.5px] font-semibold uppercase tracking-widest text-[#9ca3af]">WhatsApp</span>
            </div>
            {waNavItems.map((item) => {
              const active = isActive(item.href);
              return (
                <NavLink
                  key={item.href} href={item.href} label={item.label} icon={item.icon}
                  active={active}
                  badge={item.href === "/wa/inbox" ? inboxUnread : undefined}
                  accent={{
                    activeBg:   "bg-white",
                    activeText: "text-[#065f46]",
                    hoverBg:    "hover:bg-white",
                    iconColor:  "text-[#16a34a]",
                  }}
                />
              );
            })}
          </div>
        )}

        {/* WooCommerce */}
        {showWoo && (
          <div className="space-y-0.5">
            <div className="mb-0.5 mt-2.5 flex items-center gap-1.5 px-2.5">
              <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 text-[#7f54b3]" aria-hidden="true">
                <path fill="currentColor" d="M2.2 2h19.6C22.99 2 24 3.01 24 4.2v10.08c0 1.19-1.01 2.2-2.2 2.2H13.5l1.63 3.27-4.36-3.27H2.2C1.01 16.48 0 15.47 0 14.28V4.2C0 3.01 1.01 2 2.2 2zm2.01 3.33c-.31.04-.54.19-.65.5-.06.18-.04.37.02.56l2.18 6.93 2.27-4.46 2.27 4.46 2.18-6.93c.11-.37-.04-.75-.38-.92a.76.76 0 00-.99.34l-1.08 3.9-1.98-3.88-2.01 3.88-1.08-3.9c-.11-.36-.41-.52-.75-.48zm11.06.12c-.72.04-1.37.46-1.68 1.11-.31.66-.25 1.46.17 2.06.43.61 1.16.93 1.9.84.74-.09 1.38-.59 1.63-1.3.25-.7.08-1.49-.43-2.02a1.87 1.87 0 00-1.59-.69zm0 .98c.36-.01.71.17.91.47.2.3.24.69.09 1.02-.14.34-.46.57-.82.61-.36.04-.72-.12-.94-.42-.22-.3-.26-.7-.1-1.04.16-.34.5-.57.86-.64z"/>
              </svg>
              <span className="text-[10.5px] font-semibold uppercase tracking-widest text-[#9ca3af]">WooCommerce</span>
            </div>
            {WOO_NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <NavLink
                  key={item.href} href={item.href} label={item.label} icon={item.icon}
                  active={active}
                  accent={{
                    activeBg:   "bg-white",
                    activeText: "text-[#5b21b6]",
                    hoverBg:    "hover:bg-white",
                    iconColor:  "text-[#7f54b3]",
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Shopify */}
        {showShopify && (
          <div className="space-y-0.5">
            <div className="mb-0.5 mt-2.5 flex items-center gap-1.5 px-2.5">
              <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="#95BF47" aria-hidden="true">
                <path d="M15.337.338a.538.538 0 0 0-.485-.338c-.202 0-3.837.08-3.837.08S8.04.323 7.853.13A.568.568 0 0 0 7.45 0C6.897 0 6.37.3 5.9.892L5 2.11c-.54.082-1.08.176-1.62.283C2.38 2.672 1.5 3.79 1.093 5.31.686 6.842.363 8.778.18 11.182c-.108 1.432-.162 2.916-.162 4.41 0 .66.02 1.31.06 1.94l.052.795C.65 21.26 3.047 24 5.5 24c.162 0 .323-.01.483-.028l.29-.039c.33.027.663.04.996.04 2.7 0 5.307-.862 7.437-2.454l.434-.333c.5-.392.857-.943.99-1.562l.822-3.858.004-.02 2.783-13.047A.538.538 0 0 0 18.5.8l-3.163-.462z"/>
              </svg>
              <span className="text-[10.5px] font-semibold uppercase tracking-widest text-[#9ca3af]">Shopify</span>
            </div>
            {SHOPIFY_NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <NavLink
                  key={item.href} href={item.href} label={item.label} icon={item.icon}
                  active={active}
                  accent={{
                    activeBg:   "bg-white",
                    activeText: "text-[#4a7c1f]",
                    hoverBg:    "hover:bg-white",
                    iconColor:  "text-[#95BF47]",
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Admin */}
        {settingsItems.length > 0 && (
          <div className="space-y-0.5">
            <SectionLabel label="Admin" />
            {settingsItems.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActive(item.href)} />
            ))}
          </div>
        )}

      </nav>

      {/* User card */}
      <div className="shrink-0 border-t border-[#e5e7eb] p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5">
          {/* Avatar with online dot */}
          <div className="relative shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1e293b] text-[11px] font-bold text-white">
              {initials || "U"}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold leading-snug text-[#111827]">{user.name}</p>
            <p className="truncate text-[11px] leading-snug text-[#9ca3af]">{ROLE_LABEL[user.role]}</p>
          </div>
          <button
            type="button" onClick={signOut} disabled={signing}
            title="Sign out"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#9ca3af] transition hover:bg-white hover:text-red-500 disabled:opacity-40"
          >
            <IcLogout className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );

  // ── Full-canvas pages (flow editor) — no shell chrome ────────────────────
  if (isFlowEditor) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {sidebar}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[#e5e7eb] bg-white px-5 lg:px-7">

          {/* Left: mobile hamburger + breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              type="button" onClick={() => setSidebarOpen(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-[#f6f8fa] hover:text-[#6b7280] transition sm:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>

            {/* Breadcrumb */}
            <div className="hidden items-center gap-1.5 sm:flex">
              {meta.parent && meta.parentHref ? (
                <>
                  <Link href={meta.parentHref} className="text-[13px] font-medium text-[#9ca3af] transition hover:text-[#6b7280]">
                    {meta.parent}
                  </Link>
                  <span className="text-[#d1d5db] select-none">/</span>
                </>
              ) : null}
              <span className="text-[13px] font-semibold text-[#0f172a]">{meta.title}</span>
            </div>

            {/* Mobile: logo */}
            <div className="sm:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={appName} className="h-6 w-auto" />
            </div>
          </div>

          {/* Right: search */}
          <div className="flex items-center gap-2">
            <SearchBar role={user.role} />
          </div>
        </header>

        {/* Page content */}
        <main className="relative flex-1 overflow-auto">
          {navShow && (
            <div
              className="absolute inset-x-0 top-0 z-50 h-[2px]"
              style={{
                background: "#0f172a",
                width: `${navPct}%`,
                opacity: navPct >= 100 ? 0 : 1,
                transition: navPct >= 100
                  ? "width 0.18s ease-in, opacity 0.22s ease-out 0.15s"
                  : "width 0.06s linear, opacity 0.1s",
              }}
            />
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function IcDashboard(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>;
}
function IcPlus(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>;
}
function IcOrders(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>;
}
function IcBranch(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
}
function IcUsers(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a5 5 0 016.5-4.6"/></svg>;
}
function IcCustomers(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>;
}
function IcSend(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
}
function IcHistory(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
}
function IcTemplate(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>;
}
function IcWoo(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...p}><path fill="currentColor" d="M2.2 2h19.6C22.99 2 24 3.01 24 4.2v10.08c0 1.19-1.01 2.2-2.2 2.2H13.5l1.63 3.27-4.36-3.27H2.2C1.01 16.48 0 15.47 0 14.28V4.2C0 3.01 1.01 2 2.2 2zm2.01 3.33c-.31.04-.54.19-.65.5-.06.18-.04.37.02.56l2.18 6.93 2.27-4.46 2.27 4.46 2.18-6.93c.11-.37-.04-.75-.38-.92a.76.76 0 00-.99.34l-1.08 3.9-1.98-3.88-2.01 3.88-1.08-3.9c-.11-.36-.41-.52-.75-.48zm11.06.12c-.72.04-1.37.46-1.68 1.11-.31.66-.25 1.46.17 2.06.43.61 1.16.93 1.9.84.74-.09 1.38-.59 1.63-1.3.25-.7.08-1.49-.43-2.02a1.87 1.87 0 00-1.59-.69zm0 .98c.36-.01.71.17.91.47.2.3.24.69.09 1.02-.14.34-.46.57-.82.61-.36.04-.72-.12-.94-.42-.22-.3-.26-.7-.1-1.04.16-.34.5-.57.86-.64z"/></svg>;
}
function IcShopify(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="#95BF47" aria-hidden="true" {...p}><path d="M15.337.338a.538.538 0 0 0-.485-.338c-.202 0-3.837.08-3.837.08S8.04.323 7.853.13A.568.568 0 0 0 7.45 0C6.897 0 6.37.3 5.9.892L5 2.11c-.54.082-1.08.176-1.62.283C2.38 2.672 1.5 3.79 1.093 5.31.686 6.842.363 8.778.18 11.182c-.108 1.432-.162 2.916-.162 4.41 0 .66.02 1.31.06 1.94l.052.795C.65 21.26 3.047 24 5.5 24c.162 0 .323-.01.483-.028l.29-.039c.33.027.663.04.996.04 2.7 0 5.307-.862 7.437-2.454l.434-.333c.5-.392.857-.943.99-1.562l.822-3.858.004-.02 2.783-13.047A.538.538 0 0 0 18.5.8L15.337.338z"/></svg>;
}
function IcSettings(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
}
function IcPortalSettings(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/></svg>;
}
function IcQuickReply(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
}
function IcInbox(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M8 10h8M8 14h5"/></svg>;
}
function IcFlow(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><rect x="3" y="3" width="6" height="4" rx="1"/><rect x="15" y="9" width="6" height="4" rx="1"/><rect x="3" y="17" width="6" height="4" rx="1"/><path d="M9 5h3a3 3 0 013 3v1M9 19h3a3 3 0 003-3v-1"/></svg>;
}
function IcLeads(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
}
function IcIntegrations(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>;
}
function IcLogout(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
}
function IcReport(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>;
}
function IcQueue(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/><circle cx="17" cy="17" r="3"/><path d="M17 15.5v1.5l1 1"/></svg>;
}
