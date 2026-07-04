import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { getPortalSettings } from "@/lib/portalSettings";

export default async function BotConfigLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "SUPER_ADMIN") return <>{children}</>;
  if (user.role === "ADMIN") {
    const settings = await getPortalSettings();
    if (settings.woo_visible_to_admin) return <>{children}</>;
  }
  redirect("/dashboard");
}
