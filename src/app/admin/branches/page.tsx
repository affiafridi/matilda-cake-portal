import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

export default async function BranchesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/branches");
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const parents = await prisma.branch.findMany({
    where: { parentId: null },
    orderBy: { sortOrder: "asc" },
    include: {
      children: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          isActive: true,
          _count: { select: { orders: true } },
        },
      },
    },
  });

  return (
    <div className="min-h-screen bg-canvas px-6 py-5 lg:px-8">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-ink">Branches</h1>
        <p className="mt-0.5 text-sm text-ink-muted">View all branch locations.</p>
      </header>

      <div className="space-y-4">
        {parents.map((p) => (
          <section
            key={p.id}
            className="rounded-2xl border border-rule bg-white overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3 bg-canvas border-b border-rule">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{p.name}</h2>
              {!p.isActive && (
                <span className="rounded-full bg-ink-muted/15 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                  Inactive
                </span>
              )}
            </div>
            <ul className="divide-y divide-rule">
              {p.children.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="font-medium text-ink">{c.name}</span>
                  <span className="text-xs text-ink-muted">
                    {c._count.orders} {c._count.orders === 1 ? "order" : "orders"}
                    {!c.isActive && " · inactive"}
                  </span>
                </li>
              ))}
              {p.children.length === 0 && (
                <li className="px-5 py-3 text-xs text-ink-muted">No sub-branches.</li>
              )}
            </ul>
          </section>
        ))}
        {parents.length === 0 && (
          <p className="text-sm text-ink-muted">
            No branches yet. Run{" "}
            <code className="rounded bg-cream/60 px-1 py-0.5 font-mono text-xs">
              npx prisma db seed
            </code>{" "}
            to populate them.
          </p>
        )}
      </div>
    </div>
  );
}
