import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalSettings } from "@/lib/portalSettings";
import { LoginContent } from "./LoginContent";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // First-run guard: no users → send to setup wizard
  const userCount = await prisma.user.count().catch(() => 0);
  if (userCount === 0) redirect("/setup");

  const { app_name, logo_url } = await getPortalSettings();
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-2xl border border-rule bg-surface p-6 shadow-sm sm:p-8">
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-caramel">{app_name}</p>
            <h1 className="mt-2 text-2xl font-semibold text-ink">Sign in</h1>
          </div>
          <div className="h-32 animate-pulse rounded-lg bg-cream/40" />
        </div>
      </div>
    }>
      <LoginContent appName={app_name} logoUrl={logo_url} />
    </Suspense>
  );
}
