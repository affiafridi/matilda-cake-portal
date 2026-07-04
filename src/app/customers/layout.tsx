import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell/AppShell";
import { getCurrentUser } from "@/lib/auth/server";
import { getPortalSettings } from "@/lib/portalSettings";

export default async function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/customers");
  const settings = await getPortalSettings();
  return (
    <AppShell user={{ id: user.id, name: user.name, role: user.role }} settings={settings}>
      {children}
    </AppShell>
  );
}
