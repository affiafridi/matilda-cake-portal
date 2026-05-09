"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Role = "SUPER_ADMIN" | "ADMIN" | "CHEF" | "COORDINATOR";

type NavItem = {
  href: string;
  label: string;
  roles: readonly Role[];
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    roles: ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "CHEF"],
  },
  {
    href: "/new-order",
    label: "New Order",
    roles: ["SUPER_ADMIN", "ADMIN", "COORDINATOR"],
  },
  {
    href: "/orders",
    label: "Orders",
    roles: ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "CHEF"],
  },
  {
    href: "/admin/branches",
    label: "Branches",
    roles: ["SUPER_ADMIN", "ADMIN"],
  },
  {
    href: "/admin/users",
    label: "Users",
    roles: ["SUPER_ADMIN", "ADMIN"],
  },
];

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
  CHEF: "Chef",
  COORDINATOR: "Coordinator",
};

const ROLE_BADGE: Record<Role, string> = {
  SUPER_ADMIN: "bg-brand text-white",
  ADMIN: "bg-caramel text-white",
  CHEF: "bg-success/15 text-success",
  COORDINATOR: "bg-cream text-ink",
};

export default function AppShell({
  user,
  children,
}: {
  user: { id: string; name: string; role: Role };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const items = NAV_ITEMS.filter((i) => i.roles.includes(user.role));

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-rule bg-surface",
          "transform transition-transform duration-200 ease-out",
          "sm:static sm:translate-x-0 sm:z-auto",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-rule px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-caramel">
              Matilda Cakes
            </p>
            <p className="mt-1 text-sm font-medium text-ink">Operations</p>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
            {items.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "block rounded-lg px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-cream/70 text-ink"
                      : "text-ink-muted hover:bg-cream/40 hover:text-ink",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-rule px-2 py-3">
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-muted transition hover:bg-cream/40 hover:text-danger"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-rule bg-surface/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-3 py-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-md p-2 text-ink-muted hover:bg-cream/60 sm:hidden"
              aria-label="Open menu"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0 flex-1 sm:hidden">
              <p className="truncate text-sm font-semibold text-ink">
                Matilda Cakes
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-sm font-medium text-ink">{user.name}</div>
                <div className="text-[11px] uppercase tracking-wider text-ink-muted">
                  {ROLE_LABEL[user.role]}
                </div>
              </div>
              <span
                className={[
                  "inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
                  ROLE_BADGE[user.role],
                ].join(" ")}
              >
                {ROLE_LABEL[user.role]}
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
