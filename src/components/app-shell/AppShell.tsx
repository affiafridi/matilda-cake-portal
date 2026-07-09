"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement, type SVGProps } from "react";

type Role = "SUPER_ADMIN" | "ADMIN" | "AGENT" | "OPERATOR";

// ── Route → page title map ─────────────────────────────────────────────────

const PAGE_TITLES: Record<string, { title: string; parent?: string; parentHref?: string }> = {
  "/dashboard":           { title: "Dashboard" },
  "/new-order":           { title: "New Order",         parent: "Orders",    parentHref: "/orders" },
  "/orders":              { title: "Orders" },
  "/admin/branches":      { title: "Branches",           parent: "Admin",     parentHref: "/admin/settings" },
  "/admin/users":         { title: "Users",              parent: "Admin",     parentHref: "/admin/settings" },
  "/admin/settings":      { title: "Configuration",      parent: "Admin",     parentHref: "/dashboard" },
  "/admin/integrations":  { title: "Integrations",       parent: "Admin",     parentHref: "/admin/settings" },
  "/admin/quick-replies": { title: "Quick Replies",      parent: "WhatsApp",  parentHref: "/wa/inbox" },
  "/customers":           { title: "Customers",          parent: "WhatsApp",  parentHref: "/wa/inbox" },
  "/wa/templates":        { title: "Send Campaign",      parent: "WhatsApp",  parentHref: "/wa/inbox" },
  "/wa/campaigns":        { title: "Campaign History",   parent: "WhatsApp",  parentHref: "/wa/inbox" },
  "/wa/manage":           { title: "Manage Templates",   parent: "WhatsApp",  parentHref: "/wa/inbox" },
  "/wa/settings":         { title: "Channel Settings",   parent: "WhatsApp",  parentHref: "/wa/inbox" },
  "/wa/inbox":            { title: "Team Inbox",         parent: "WhatsApp",  parentHref: "/dashboard" },
  "/wa/woocommerce":      { title: "WooCommerce",        parent: "Integrations", parentHref: "/admin/integrations" },
  "/wa/flows":            { title: "Flow Builder",       parent: "WhatsApp",  parentHref: "/wa/inbox" },
};

function getPageMeta(pathname: string) {
  const exact = PAGE_TITLES[pathname];
  if (exact) return exact;
  const partial = Object.entries(PAGE_TITLES).find(([k]) => k !== "/" && pathname.startsWith(k + "/"));
  return partial?.[1] ?? { title: "Portal" };
}

// ── Nav structure ──────────────────────────────────────────────────────────

type NavItem = {
  href: string; label: string;
  roles: readonly Role[];
  icon: (p: SVGProps<SVGSVGElement>) => ReactElement;
};

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["SUPER_ADMIN","ADMIN","AGENT","OPERATOR"], icon: IcDashboard },
];

const PORTAL_NAV: NavItem[] = [
  { href: "/new-order",      label: "New Order", roles: ["SUPER_ADMIN","ADMIN","AGENT"],            icon: IcPlus },
  { href: "/orders",         label: "Orders",    roles: ["SUPER_ADMIN","ADMIN","AGENT","OPERATOR"], icon: IcOrders },
  { href: "/admin/branches", label: "Branches",  roles: ["SUPER_ADMIN","ADMIN"],                    icon: IcBranch },
  { href: "/admin/users",    label: "Users",     roles: ["SUPER_ADMIN","ADMIN"],                    icon: IcUsers },
];

const SETTINGS_NAV: NavItem[] = [
  { href: "/admin/settings",     label: "Configuration",   roles: ["SUPER_ADMIN"], icon: IcPortalSettings },
  { href: "/admin/integrations", label: "Integrations",    roles: ["SUPER_ADMIN"], icon: IcIntegrations },
];

const WA_NAV: { href: string; label: string; icon: (p: SVGProps<SVGSVGElement>) => ReactElement; roles: readonly Role[] }[] = [
  { href: "/wa/inbox",             label: "Team Inbox",       icon: IcInbox,      roles: ["SUPER_ADMIN", "ADMIN", "AGENT"] },
  { href: "/customers",            label: "Customers",        icon: IcCustomers,  roles: ["SUPER_ADMIN", "ADMIN"] },
  { href: "/admin/quick-replies",  label: "Quick Replies",    icon: IcQuickReply, roles: ["SUPER_ADMIN", "ADMIN"] },
  { href: "/wa/templates",         label: "Send Campaign",    icon: IcSend,       roles: ["SUPER_ADMIN", "ADMIN"] },
  { href: "/wa/campaigns",         label: "Campaign History", icon: IcHistory,    roles: ["SUPER_ADMIN", "ADMIN"] },
  { href: "/wa/manage",            label: "Manage Templates", icon: IcTemplate,   roles: ["SUPER_ADMIN", "ADMIN"] },
  { href: "/wa/settings",          label: "Channel Settings", icon: IcSettings,   roles: ["SUPER_ADMIN", "ADMIN"] },
  { href: "/wa/flows",             label: "Flow Builder",     icon: IcFlow,        roles: ["SUPER_ADMIN", "ADMIN"] },
];

const WOO_NAV = [
  { href: "/wa/woocommerce", label: "WooCommerce", icon: IcWoo },
];

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN:       "Admin",
  AGENT:    "Agent",
  OPERATOR: "Operator",
};

// ── AppShell ───────────────────────────────────────────────────────────────

type Settings = {
  woo_visible_to_admin:    boolean;
  wa_visible_to_admin:     boolean;
  portal_visible_to_admin: boolean;
  app_name?:  string;
  logo_url?:  string;
};

export default function AppShell({
  user, children, settings,
}: {
  user: { id: string; name: string; role: Role };
  children: React.ReactNode;
  settings?: Settings;
}) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [open, setOpen]               = useState(false);
  const [signing, setSigning]         = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [navPct, setNavPct]   = useState(0);
  const [navShow, setNavShow] = useState(false);
  const navMounted = useRef(false);
  const navTick    = useRef<ReturnType<typeof setInterval> | null>(null);
  const navDone    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(() =>
    typeof window !== "undefined" && window.location.pathname.startsWith("/admin/settings") ||
    typeof window !== "undefined" && window.location.pathname.startsWith("/admin/integrations")
  );

  function startNav() {
    if (navTick.current) clearInterval(navTick.current);
    if (navDone.current) clearTimeout(navDone.current);
    setNavPct(0);
    setNavShow(true);
    // tick up quickly at first, then slow as it approaches 85%
    let pct = 0;
    navTick.current = setInterval(() => {
      pct += (85 - pct) * 0.08;
      setNavPct(Math.min(pct, 85));
    }, 60);
  }

  function finishNav() {
    if (navTick.current) { clearInterval(navTick.current); navTick.current = null; }
    setNavPct(100);
    navDone.current = setTimeout(() => { setNavShow(false); setNavPct(0); }, 380);
  }

  // Page settled — complete the bar
  useEffect(() => {
    setOpen(false);
    if (pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/integrations")) {
      setSettingsOpen(true);
    }
    if (!navMounted.current) { navMounted.current = true; return; }
    finishNav();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Start bar the moment user clicks an internal link
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

  // Poll unread count for inbox-eligible users
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

  // Update browser tab title with unread badge
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = inboxUnread > 0 ? `(${inboxUnread}) ${base}` : base;
  }, [inboxUnread]);

  const appName = settings?.app_name ?? "Order Portal";
  const logoUrl = settings?.logo_url ?? "/uploads/logo.png";

  const waNavItems    = WA_NAV.filter((i) => i.roles.includes(user.role));
  const isWaUser      = waNavItems.length > 0;
  const isSuperAdmin  = user.role === "SUPER_ADMIN";
  const showWoo    = isSuperAdmin || (user.role === "ADMIN" && (settings?.woo_visible_to_admin    ?? false));
  const showWA     = isSuperAdmin || user.role === "AGENT" || (user.role === "ADMIN" && (settings?.wa_visible_to_admin     ?? true));
  const showPortal = isSuperAdmin || user.role === "AGENT" || user.role === "OPERATOR" || (user.role === "ADMIN" && (settings?.portal_visible_to_admin ?? true));
  const items         = MAIN_NAV.filter((i) => i.roles.includes(user.role));
  const portalItems   = PORTAL_NAV.filter((i) => i.roles.includes(user.role));
  const settingsItems = SETTINGS_NAV.filter((i) => i.roles.includes(user.role));
  const meta     = getPageMeta(pathname);

  const initials = user.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  async function signOut() {
    if (signing) return;
    setSigning(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    router.replace("/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/orders") return pathname === "/orders" || (pathname.startsWith("/orders/") && !pathname.startsWith("/orders/new"));
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="flex min-h-screen bg-canvas">

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm sm:hidden"
          onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      {/* ── Sidebar ── */}
      <aside
        style={{ background: "var(--sb-bg)", borderColor: "var(--sb-border)" }}
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col",
          "border-r",
          "transform transition-transform duration-200 ease-out",
          "sm:sticky sm:top-0 sm:h-screen sm:translate-x-0 sm:z-auto",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}>

        {/* Logo area */}
        <div
          style={{ borderColor: "var(--sb-border)" }}
          className="flex h-[64px] shrink-0 items-center justify-center border-b px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={appName} className="h-9 w-auto" />
        </div>

        {/* Nav scroll area */}
        <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3 space-y-3">

          {/* Dashboard */}
          <div className="space-y-0.5">
            {items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}
                  style={active ? { background: "var(--sb-active-bg)", color: "var(--sb-active-fg)" } : { color: "var(--sb-fg)" }}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 hover:opacity-90"
                  onMouseEnter={!active ? (e) => ((e.currentTarget as HTMLElement).style.background = "var(--sb-hover-bg)") : undefined}
                  onMouseLeave={!active ? (e) => ((e.currentTarget as HTMLElement).style.background = "") : undefined}>
                  <span style={{ background: active ? "rgba(255,255,255,0.15)" : "var(--sb-icon-bg)" }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors">
                    <Icon style={{ color: active ? "var(--sb-active-fg)" : "var(--sb-icon-color)" }} className="h-4 w-4" />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* PORTAL section */}
          {showPortal && portalItems.length > 0 && (
            <div>
              <p style={{ color: "var(--sb-muted)" }} className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.12em]">Portal</p>
              <div className="space-y-0.5">
                {portalItems.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}
                      style={active ? { background: "var(--sb-active-bg)", color: "var(--sb-active-fg)" } : { color: "var(--sb-fg)" }}
                      className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 hover:opacity-90"
                      onMouseEnter={!active ? (e) => ((e.currentTarget as HTMLElement).style.background = "var(--sb-hover-bg)") : undefined}
                      onMouseLeave={!active ? (e) => ((e.currentTarget as HTMLElement).style.background = "") : undefined}>
                      <span style={{ background: active ? "rgba(255,255,255,0.15)" : "var(--sb-icon-bg)" }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors">
                        <Icon style={{ color: active ? "var(--sb-active-fg)" : "var(--sb-icon-color)" }} className="h-4 w-4" />
                      </span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* WHATSAPP section — admin only */}
          {isWaUser && showWA && (
            <div>
              {/* Section label */}
              <div className="mb-1 flex items-center gap-2 px-3">
                <div className="h-px flex-1 bg-rule" />
                <div className="flex items-center gap-1.5">
                  {/* WhatsApp Business icon — chat bubble with B badge */}
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
                    <path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path fill="#25D366" d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.528 5.849L.057 23.899a.75.75 0 00.921.921l6.05-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.857a9.834 9.834 0 01-5.032-1.381l-.36-.214-3.733.907.922-3.638-.235-.374A9.857 9.857 0 012.143 12C2.143 6.55 6.55 2.143 12 2.143S21.857 6.55 21.857 12 17.45 21.857 12 21.857z"/>
                    {/* Business badge */}
                    <circle cx="18.5" cy="18.5" r="5.5" fill="#075E54"/>
                    <text x="18.5" y="22" textAnchor="middle" fill="white" fontSize="6.5" fontWeight="bold" fontFamily="sans-serif">B</text>
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#075E54]/70">WhatsApp Business</span>
                </div>
                <div className="h-px flex-1 bg-rule" />
              </div>
              <div className="space-y-0.5">
                {waNavItems.map((item) => {
                  const active  = isActive(item.href);
                  const Icon    = item.icon;
                  const showBadge = item.href === "/wa/inbox" && inboxUnread > 0 && !active;
                  return (
                    <Link key={item.href} href={item.href}
                      style={!active ? { color: "var(--sb-fg)" } : undefined}
                      className={[
                        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
                        active
                          ? "bg-[#075E54] text-white"
                          : "hover:bg-[#e8f5e9]/60 hover:text-[#075E54]",
                      ].join(" ")}>
                      <span className={["flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                        active ? "bg-white/15" : "bg-[#e8f5e9] group-hover:bg-[#e8f5e9]",
                      ].join(" ")}>
                        <Icon className={["h-4 w-4", active ? "text-white" : "text-[#25D366]"].join(" ")} />
                      </span>
                      {item.label}
                      {showBadge && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {inboxUnread > 99 ? "99+" : inboxUnread}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* WOOCOMMERCE section */}
          {showWoo && (
            <div>
              <div className="mb-1 flex items-center gap-2 px-3">
                <div className="h-px flex-1 bg-rule" />
                <div className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-3 w-3 text-[#7f54b3]" aria-hidden="true"><path fill="currentColor" d="M2.2 2h19.6C22.99 2 24 3.01 24 4.2v10.08c0 1.19-1.01 2.2-2.2 2.2H13.5l1.63 3.27-4.36-3.27H2.2C1.01 16.48 0 15.47 0 14.28V4.2C0 3.01 1.01 2 2.2 2zm2.01 3.33c-.31.04-.54.19-.65.5-.06.18-.04.37.02.56l2.18 6.93 2.27-4.46 2.27 4.46 2.18-6.93c.11-.37-.04-.75-.38-.92a.76.76 0 00-.99.34l-1.08 3.9-1.98-3.88-2.01 3.88-1.08-3.9c-.11-.36-.41-.52-.75-.48zm11.06.12c-.72.04-1.37.46-1.68 1.11-.31.66-.25 1.46.17 2.06.43.61 1.16.93 1.9.84.74-.09 1.38-.59 1.63-1.3.25-.7.08-1.49-.43-2.02a1.87 1.87 0 00-1.59-.69zm0 .98c.36-.01.71.17.91.47.2.3.24.69.09 1.02-.14.34-.46.57-.82.61-.36.04-.72-.12-.94-.42-.22-.3-.26-.7-.1-1.04.16-.34.5-.57.86-.64z"/></svg>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7f54b3]/70">WooCommerce</span>
                </div>
                <div className="h-px flex-1 bg-rule" />
              </div>
              <div className="space-y-0.5">
                {WOO_NAV.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}
                      style={!active ? { color: "var(--sb-fg)" } : undefined}
                      className={[
                        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
                        active
                          ? "bg-[#7f54b3] text-white"
                          : "hover:bg-[#f3eeff]/60 hover:text-[#7f54b3]",
                      ].join(" ")}>
                      <span className={["flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                        active ? "bg-white/15" : "bg-[#f3eeff] group-hover:bg-[#f3eeff]",
                      ].join(" ")}>
                        <Icon className={["h-4 w-4", active ? "text-white" : "text-[#7f54b3]"].join(" ")} />
                      </span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ADMIN section */}
          {settingsItems.length > 0 && (
            <div>
              <p style={{ color: "var(--sb-muted)" }} className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.12em]">Admin</p>
              <div className="space-y-0.5">
                {settingsItems.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}
                      style={active ? { background: "var(--sb-active-bg)", color: "var(--sb-active-fg)" } : { color: "var(--sb-fg)" }}
                      className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 hover:opacity-90"
                      onMouseEnter={!active ? (e) => ((e.currentTarget as HTMLElement).style.background = "var(--sb-hover-bg)") : undefined}
                      onMouseLeave={!active ? (e) => ((e.currentTarget as HTMLElement).style.background = "") : undefined}>
                      <span style={{ background: active ? "rgba(255,255,255,0.15)" : "var(--sb-icon-bg)" }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors">
                        <Icon style={{ color: active ? "var(--sb-active-fg)" : "var(--sb-icon-color)" }} className="h-4 w-4" />
                      </span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* SIGN OUT */}
          <div>
            <p style={{ color: "var(--sb-muted)" }} className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.12em]">General</p>
            <div className="space-y-0.5">
              <button type="button" onClick={signOut} disabled={signing}
                style={{ color: "var(--sb-fg)" }}
                onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(239,68,68,0.10)"; el.style.color = "#dc2626"; }}
                onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = ""; el.style.color = "var(--sb-fg)"; }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:opacity-50">
                <span style={{ background: "var(--sb-icon-bg)" }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                  <IcLogout style={{ color: "var(--sb-icon-color)" }} className="h-4 w-4" />
                </span>
                {signing ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        </nav>

        {/* User card */}
        <div style={{ borderColor: "var(--sb-border)" }} className="shrink-0 border-t p-3">
          <div style={{ background: "var(--sb-hover-bg)" }} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div style={{ background: "var(--sb-active-bg)", color: "var(--sb-active-fg)" }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold">
              {initials || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p style={{ color: "var(--sb-fg)" }} className="truncate text-sm font-semibold">{user.name}</p>
              <p style={{ color: "var(--sb-muted)" }} className="truncate text-[11px]">{ROLE_LABEL[user.role]}</p>
            </div>
            <div className="h-2 w-2 rounded-full bg-[#25D366]" title="Online" />
          </div>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Top header — hidden on full-canvas pages like the flow editor */}
        <header className={`sticky top-0 z-30 flex h-[64px] shrink-0 items-center justify-between border-b border-rule bg-white px-6 lg:px-8${/^\/wa\/flows\/\d+/.test(pathname) ? " hidden" : ""}`}>

          {/* Left: hamburger (mobile) + breadcrumb */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-rule text-ink-muted hover:bg-canvas sm:hidden">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>

            {/* Breadcrumb */}
            <div className="hidden items-center gap-1.5 sm:flex">
              {meta.parent && meta.parentHref ? (
                <>
                  <Link href={meta.parentHref}
                    className="text-sm text-ink-muted hover:text-ink transition">
                    {meta.parent}
                  </Link>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-ink-muted/40" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </>
              ) : null}
              <span className="text-sm font-semibold text-ink">{meta.title}</span>
            </div>

            {/* Mobile: just logo */}
            <div className="sm:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={appName} className="h-7 w-auto" />
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <button type="button"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-rule bg-white text-ink-muted hover:bg-canvas transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            </button>

            {/* User avatar + name */}
            <button type="button"
              className="flex items-center gap-2.5 rounded-xl border border-rule bg-white px-3 py-1.5 transition hover:bg-canvas">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-[11px] font-bold text-white">
                {initials || "U"}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-semibold leading-tight text-ink">{user.name.split(" ")[0]}</p>
                <p className="text-[10px] leading-tight text-caramel">{ROLE_LABEL[user.role]}</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="hidden h-3 w-3 text-ink-muted sm:block" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto relative">
          {/* Navigation progress bar */}
          {navShow && (
            <div
              className="absolute inset-x-0 top-0 z-50 h-px"
              style={{
                background: "var(--color-brand)",
                width: `${navPct}%`,
                opacity: navPct >= 100 ? 0 : 1,
                transition: navPct >= 100
                  ? "width 0.18s ease-in, opacity 0.22s ease-out 0.15s"
                  : "width 0.06s linear, opacity 0.1s",
                boxShadow: "0 0 4px 0px var(--color-brand)",
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
function IcIntegrations(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>;
}
function IcLogout(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
}
