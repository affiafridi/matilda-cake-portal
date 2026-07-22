import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell/AppShell";
import { getCurrentUser } from "@/lib/auth/server";
import { getPortalSettings } from "@/lib/portalSettings";
import { getIntegrations } from "@/lib/integrations";

export default async function WaLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [settings, integrations] = await Promise.all([
    getPortalSettings(),
    getIntegrations(),
  ]);

  const woo_configured     = !!(integrations.wc_url && integrations.wc_consumer_key && integrations.wc_consumer_secret);
  const shopify_configured = !!(integrations.shopify_domain && integrations.shopify_access_token);

  return (
    <AppShell
      user={{ id: user.id, name: user.name, role: user.role }}
      settings={{ ...settings, woo_configured, shopify_configured }}
    >
      {children}
    </AppShell>
  );
}
