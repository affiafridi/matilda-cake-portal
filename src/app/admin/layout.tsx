import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell/AppShell";
import { getCurrentUser } from "@/lib/auth/server";
import { getPortalSettings } from "@/lib/portalSettings";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") redirect("/wa/inbox");

  const settings = await getPortalSettings();

  return (
    <AppShell user={{ id: user.id, name: user.name, role: user.role }} settings={settings}>
      {children}
    </AppShell>
  );
}
