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
    <main className="min-h-screen bg-canvas px-6 py-5 lg:px-8">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-ink">Users</h1>
        <p className="mt-0.5 text-sm text-ink-muted">Manage portal access and roles.</p>
      </header>
      <UsersClient
        actor={{ id: actor.id, role: actor.role }}
        assignableRoles={assignableRoles(actor)}
      />
    </main>
  );
}
