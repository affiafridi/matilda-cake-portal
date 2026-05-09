import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { assignableRoles } from "@/lib/auth/role-policy";
import UsersClient from "./users-client";

export default async function UsersPage() {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login?next=/admin/users");
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-[1400px] px-3 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-caramel">
            Matilda Cakes · Admin
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Users</h1>
        </div>
      </header>
      <UsersClient
        actor={{ id: actor.id, role: actor.role }}
        assignableRoles={assignableRoles(actor)}
      />
    </main>
  );
}
