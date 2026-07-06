import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import SetupClient from "./SetupClient";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // If already logged in → go to dashboard
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect("/dashboard");

  // If setup already done → go to login
  const userCount = await prisma.user.count().catch(() => 0);
  if (userCount > 0) redirect("/login");

  return <SetupClient />;
}
