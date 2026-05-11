"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactElement, type SVGProps } from "react";
type Role = "SUPER_ADMIN" | "ADMIN" | "CHEF" | "COORDINATOR";

type NavItem = {
  href: string;
  label: string;
  roles: readonly Role[];
  icon: (props: SVGProps<SVGSVGElement>) => ReactElement;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    roles: ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "CHEF"],
    icon: IconDashboard,
  },
  {
    href: "/new-order",
    label: "New Order",
    roles: ["SUPER_ADMIN", "ADMIN", "COORDINATOR"],
    icon: IconPlus,
  },
  {
    href: "/orders",
    label: "Orders",
    roles: ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "CHEF"],
    icon: IconList,
  },
  {
    href: "/admin/branches",
    label: "Branches",
    roles: ["SUPER_ADMIN", "ADMIN"],
    icon: IconBranch,
  },
  {
    href: "/admin/users",
    label: "Users",
    roles: ["SUPER_ADMIN", "ADMIN"],
    icon: IconUsers,
  },
];

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* fall through to redirect anyway */
    }
    router.replace("/login");
    router.refresh();
  }

  const items = NAV_ITEMS.filter((i) => i.roles.includes(user.role));
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-canvas">
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
          {/* Logo */}
          <div className="border-b border-rule px-5 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/uploads/logo.png"
              alt="Matilda Cakes"
              className="h-10 w-auto"
            />
            <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-ink-muted">
              Operations
            </p>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
            {items.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-cream text-ink"
                      : "text-ink-muted hover:bg-cream/50 hover:text-ink",
                  ].join(" ")}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-brand"
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    className={[
                      "h-4.5 w-4.5 shrink-0 transition",
                      active ? "text-brand" : "text-ink-muted group-hover:text-ink",
                    ].join(" ")}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User card + Sign out */}
          <div className="border-t border-rule p-3">
            <div className="mb-2 flex items-center gap-3 rounded-lg bg-cream/50 px-3 py-2">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white"
                aria-hidden="true"
              >
                {initials || "U"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {user.name}
                </p>
                <p className="truncate text-[11px] uppercase tracking-wider text-ink-muted">
                  {ROLE_LABEL[user.role]}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-muted transition hover:bg-cream/50 hover:text-danger disabled:opacity-60"
            >
              <IconLogout className="h-4.5 w-4.5 shrink-0" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-rule bg-surface/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/uploads/logo.png"
                alt="Matilda Cakes"
                className="h-7 w-auto"
              />
            </div>
            <div className="ml-auto flex items-center gap-3">
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

// ===== Icons =====

function IconDashboard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function IconList(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  );
}

function IconBranch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 21V11" />
      <path d="M5 11l7-7 7 7" />
      <path d="M5 21h14" />
      <path d="M9 14h6" />
    </svg>
  );
}

function IconUsers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0113 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 20a5 5 0 016.5-4.6" />
    </svg>
  );
}

function IconLogout(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
