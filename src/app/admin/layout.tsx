import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell/AppShell";
import { getCurrentUser } from "@/lib/auth/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return (
    <AppShell user={{ id: user.id, name: user.name, role: user.role }}>
      {children}
    </AppShell>
  );
}
