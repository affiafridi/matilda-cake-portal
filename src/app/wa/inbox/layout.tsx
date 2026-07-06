import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";

const ALLOWED = new Set(["SUPER_ADMIN", "ADMIN", "AGENT"]);

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/wa/inbox");
  if (!ALLOWED.has(user.role)) redirect("/dashboard");
  return <>{children}</>;
}
