"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

type Role = "SUPER_ADMIN" | "ADMIN" | "AGENT" | "OPERATOR";

const ALL_PAGES = [
  { href: "/dashboard",           label: "Dashboard",          desc: "Overview & stats",           roles: ["SUPER_ADMIN","ADMIN","AGENT","OPERATOR"] as Role[] },
  { href: "/new-order",           label: "New Order",          desc: "Capture a customer order",    roles: ["SUPER_ADMIN","ADMIN","AGENT"] as Role[] },
  { href: "/orders",              label: "Orders",             desc: "Browse & manage orders",      roles: ["SUPER_ADMIN","ADMIN","AGENT","OPERATOR"] as Role[] },
  { href: "/admin/branches",      label: "Branches",           desc: "Branch management",           roles: ["SUPER_ADMIN","ADMIN"] as Role[] },
  { href: "/admin/users",         label: "Users",              desc: "Team & access control",       roles: ["SUPER_ADMIN","ADMIN"] as Role[] },
  { href: "/wa/inbox",            label: "Team Inbox",         desc: "WhatsApp conversations",      roles: ["SUPER_ADMIN","ADMIN","AGENT"] as Role[] },
  { href: "/customers",           label: "Customers",          desc: "WhatsApp contacts",           roles: ["SUPER_ADMIN","ADMIN"] as Role[] },
  { href: "/admin/quick-replies", label: "Quick Replies",      desc: "Saved reply templates",       roles: ["SUPER_ADMIN","ADMIN"] as Role[] },
  { href: "/wa/templates",        label: "Send Campaign",      desc: "WhatsApp broadcast",          roles: ["SUPER_ADMIN","ADMIN"] as Role[] },
  { href: "/wa/campaigns",        label: "Campaign History",   desc: "Past campaigns & analytics",  roles: ["SUPER_ADMIN","ADMIN"] as Role[] },
  { href: "/wa/manage",           label: "Manage Templates",   desc: "Create & edit templates",     roles: ["SUPER_ADMIN","ADMIN"] as Role[] },
  { href: "/wa/settings",         label: "Channel Settings",   desc: "WhatsApp channel config",     roles: ["SUPER_ADMIN","ADMIN"] as Role[] },
  { href: "/wa/flows",            label: "Flow Builder",       desc: "Automated conversation flows", roles: ["SUPER_ADMIN","ADMIN"] as Role[] },
  { href: "/wa/leads",            label: "WA Leads",           desc: "WhatsApp lead tracking",      roles: ["SUPER_ADMIN","ADMIN"] as Role[] },
  { href: "/wa/woocommerce",      label: "WooCommerce",        desc: "Product catalogue sync",      roles: ["SUPER_ADMIN","ADMIN"] as Role[] },
  { href: "/admin/settings",      label: "Configuration",      desc: "Portal & brand settings",     roles: ["SUPER_ADMIN"] as Role[] },
  { href: "/admin/integrations",  label: "Integrations",       desc: "Third-party connections",     roles: ["SUPER_ADMIN"] as Role[] },
];

type Order = {
  id: string; orderNumber: string; trackingCode: string;
  customerName: string; totalAmount: number | string;
  orderStatus: string; paymentStatus: string;
};
type Customer = {
  id: string; waId: string; customerName: string;
  lastMessageBody: string | null; unreadCount: number;
};

const AED = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 0 });

function statusColor(s: string) {
  if (s === "DELIVERED") return "text-emerald-600 bg-emerald-50";
  if (s === "CANCELLED") return "text-red-500 bg-red-50";
  if (s === "PREPARING" || s === "CONFIRMED") return "text-amber-600 bg-amber-50";
  return "text-slate-500 bg-slate-100";
}

export function SearchBar({ role }: { role: Role }) {
  const [open,      setOpen]      = useState(false);
  const [closing,   setClosing]   = useState(false);
  const [query,     setQuery]     = useState("");
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef    = useRef<HTMLInputElement>(null);
  const dropRef     = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounce    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router      = useRouter();
  const pathname    = usePathname();

  // Close on route change
  useEffect(() => { setOpen(false); setQuery(""); }, [pathname]);

  // ⌘/ shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Filtered pages
  const matchedPages = query.length >= 1
    ? ALL_PAGES.filter(p =>
        p.roles.includes(role) &&
        (p.label.toLowerCase().includes(query.toLowerCase()) ||
         p.desc.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 5)
    : [];

  // Fetch data results (debounced)
  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) { setOrders([]); setCustomers([]); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setOrders(json.data.orders ?? []);
        setCustomers(json.data.customers ?? []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setActiveIdx(0);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchResults(query), 220);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, fetchResults]);

  // Flat list of all results for keyboard nav
  type FlatItem =
    | { kind: "page";     href: string; label: string; desc: string }
    | { kind: "order";    href: string; label: string; sub: string; status: string; amount: string }
    | { kind: "customer"; href: string; label: string; sub: string; unread: number };

  const flat: FlatItem[] = [
    ...matchedPages.map(p  => ({ kind: "page"     as const, href: p.href, label: p.label, desc: p.desc })),
    ...orders.map(o        => ({ kind: "order"    as const, href: `/orders/${o.trackingCode}`, label: o.orderNumber, sub: o.customerName, status: o.orderStatus, amount: AED.format(Number(o.totalAmount ?? 0)) })),
    ...customers.map(c     => ({ kind: "customer" as const, href: `/wa/inbox`, label: c.customerName, sub: c.waId, unread: c.unreadCount })),
  ];

  const hasResults  = flat.length > 0;
  const showEmpty   = query.length >= 2 && !loading && !hasResults;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flat.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter") {
      const item = flat[activeIdx];
      if (item) { router.push(item.href); closeDropdown(); setQuery(""); }
    }
    if (e.key === "Escape") { closeDropdown(); inputRef.current?.blur(); }
  }

  function navigate(href: string) {
    router.push(href);
    closeDropdown();
    setQuery("");
  }

  function closeDropdown() {
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); }, 160);
  }

  // override the blur-close to use animated close
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showDropdown = open && query.length >= 1;

  return (
    <>
      <style>{`
        @keyframes sb-open {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes sb-close {
          from { opacity: 1; transform: translateY(0)    scale(1);    }
          to   { opacity: 0; transform: translateY(-6px) scale(0.98); }
        }
        .sb-open  { animation: sb-open  160ms cubic-bezier(0.16,1,0.3,1) forwards; }
        .sb-close { animation: sb-close 160ms cubic-bezier(0.4,0,1,1)    forwards; }
      `}</style>

    <div ref={containerRef} className="relative hidden sm:block">
      {/* Input — expands to 380px on focus */}
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search…"
          autoComplete="off"
          spellCheck={false}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          style={{
            width: open ? "380px" : "208px",
            transition: "width 220ms cubic-bezier(0.16,1,0.3,1), background 150ms, border-color 150ms",
          }}
          className="h-8 rounded-lg border border-[#e5e7eb] bg-[#f6f8fa] pl-8 pr-8 text-[13px] text-[#0f172a] placeholder:text-[#9ca3af] focus:border-[#d1d5db] focus:bg-white focus:outline-none"
        />
        <kbd
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] text-[#c4c9d4] select-none transition-opacity duration-150"
          style={{ opacity: open ? 0 : 1 }}
        >⌘/</kbd>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          ref={dropRef}
          className={`absolute right-0 top-[calc(100%+6px)] z-50 w-[380px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white ${closing ? "sb-close" : "sb-open"}`}
          style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)", transformOrigin: "top right" }}
        >
          {/* Loading */}
          {loading && query.length >= 2 && (
            <div className="flex items-center justify-center px-4 py-5">
              <svg className="h-4 w-4 animate-spin text-[#9ca3af]" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="15 45" strokeLinecap="round" />
              </svg>
            </div>
          )}

          {/* No results */}
          {showEmpty && (
            <div className="px-4 py-5 text-center">
              <p className="text-[12.5px] font-medium text-[#374151]">No results for &ldquo;{query}&rdquo;</p>
              <p className="mt-0.5 text-[11px] text-[#9ca3af]">Try a different term</p>
            </div>
          )}

          {/* Pages */}
          {matchedPages.length > 0 && (
            <div>
              <p className="px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-widest text-[#9ca3af]">Pages</p>
              {matchedPages.map((page, i) => {
                const idx = i;
                return (
                  <button
                    key={page.href}
                    type="button"
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => navigate(page.href)}
                    className={[
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition",
                      activeIdx === idx ? "bg-[#f6f8fa]" : "hover:bg-[#f6f8fa]",
                    ].join(" ")}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white">
                      <PageIcon href={page.href} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#0f172a]">{page.label}</p>
                      <p className="text-[11px] text-[#9ca3af]">{page.desc}</p>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                      className="h-3 w-3 shrink-0 text-[#d1d5db]" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                );
              })}
            </div>
          )}

          {/* Orders */}
          {orders.length > 0 && (
            <div>
              <p className="px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-widest text-[#9ca3af]">Orders</p>
              {orders.map((order, i) => {
                const idx = matchedPages.length + i;
                return (
                  <button
                    key={order.id}
                    type="button"
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => navigate(`/orders/${order.trackingCode}`)}
                    className={[
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition",
                      activeIdx === idx ? "bg-[#f6f8fa]" : "hover:bg-[#f6f8fa]",
                    ].join(" ")}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[#64748b]" aria-hidden="true">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-[12.5px] font-bold text-[#0f172a]">{order.orderNumber}</p>
                        <span className={["rounded-full px-1.5 py-0.5 text-[10px] font-semibold", statusColor(order.orderStatus)].join(" ")}>
                          {order.orderStatus.charAt(0) + order.orderStatus.slice(1).toLowerCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#9ca3af]">{order.customerName}</p>
                    </div>
                    <p className="shrink-0 text-[12.5px] font-semibold text-[#374151]">{AED.format(Number(order.totalAmount ?? 0))}</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Customers / Conversations */}
          {customers.length > 0 && (
            <div>
              <p className="px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-widest text-[#9ca3af]">Conversations</p>
              {customers.map((c, i) => {
                const idx = matchedPages.length + orders.length + i;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => navigate("/wa/inbox")}
                    className={[
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition",
                      activeIdx === idx ? "bg-[#f6f8fa]" : "hover:bg-[#f6f8fa]",
                    ].join(" ")}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-[11px] font-bold text-[#374151]">
                      {c.customerName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#0f172a]">{c.customerName}</p>
                      <p className="truncate text-[11px] text-[#9ca3af]">{c.lastMessageBody ?? c.waId}</p>
                    </div>
                    {c.unreadCount > 0 && (
                      <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1 text-[10px] font-bold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Footer hint */}
          {hasResults && (
            <div className="flex items-center gap-3 border-t border-[#f3f4f6] px-3 py-2">
              <span className="flex items-center gap-1 text-[10.5px] text-[#c4c9d4]">
                <kbd className="rounded border border-[#e5e7eb] bg-[#f6f8fa] px-1 font-mono text-[9px]">↑↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1 text-[10.5px] text-[#c4c9d4]">
                <kbd className="rounded border border-[#e5e7eb] bg-[#f6f8fa] px-1 font-mono text-[9px]">↵</kbd> open
              </span>
              <span className="flex items-center gap-1 text-[10.5px] text-[#c4c9d4]">
                <kbd className="rounded border border-[#e5e7eb] bg-[#f6f8fa] px-1 font-mono text-[9px]">Esc</kbd> close
              </span>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}

function PageIcon({ href }: { href: string }) {
  const cls = "h-3.5 w-3.5 text-[#64748b]";
  if (href === "/dashboard")           return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={cls}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>;
  if (href === "/new-order")           return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={cls}><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>;
  if (href === "/orders")              return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>;
  if (href === "/wa/inbox")            return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
  if (href === "/wa/flows")            return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={cls}><rect x="3" y="3" width="6" height="4" rx="1"/><rect x="15" y="9" width="6" height="4" rx="1"/><rect x="3" y="17" width="6" height="4" rx="1"/><path d="M9 5h3a3 3 0 013 3v1M9 19h3a3 3 0 003-3v-1"/></svg>;
  if (href.startsWith("/wa/"))         return <svg viewBox="0 0 24 24" fill="currentColor" className={cls}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.528 5.849L.057 23.899a.75.75 0 00.921.921l6.05-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.857a9.834 9.834 0 01-5.032-1.381l-.36-.214-3.733.907.922-3.638-.235-.374A9.857 9.857 0 012.143 12C2.143 6.55 6.55 2.143 12 2.143S21.857 6.55 21.857 12 17.45 21.857 12 21.857z"/></svg>;
  if (href.startsWith("/admin/"))      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={cls}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={cls}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;
}
