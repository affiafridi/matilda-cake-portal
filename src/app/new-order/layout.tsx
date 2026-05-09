import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell/AppShell";
import { getCurrentUser } from "@/lib/auth/server";

const ALLOWED = new Set(["SUPER_ADMIN", "ADMIN", "COORDINATOR"]);

export default async function NewOrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/new-order");
  if (!ALLOWED.has(user.role)) redirect("/dashboard");
  return (
    <AppShell user={{ id: user.id, name: user.name, role: user.role }}>
      {children}
    </AppShell>
  );
}
