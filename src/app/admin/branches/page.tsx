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
    <div className="mx-auto max-w-[1400px] px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-caramel">
          Operations
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Branches</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Read-only for now. Editing branches comes in a follow-up.
        </p>
      </header>

      <div className="space-y-4">
        {parents.map((p) => (
          <section
            key={p.id}
            className="rounded-2xl border border-rule bg-surface p-5 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">{p.name}</h2>
              {!p.isActive && (
                <span className="rounded-full bg-ink-muted/15 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                  Inactive
                </span>
              )}
            </div>
            <ul className="divide-y divide-rule">
              {p.children.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="text-ink">{c.name}</span>
                  <span className="text-xs text-ink-muted">
                    {c._count.orders}{" "}
                    {c._count.orders === 1 ? "order" : "orders"}
                    {!c.isActive && " · inactive"}
                  </span>
                </li>
              ))}
              {p.children.length === 0 && (
                <li className="py-3 text-xs text-ink-muted">
                  No sub-branches.
                </li>
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
