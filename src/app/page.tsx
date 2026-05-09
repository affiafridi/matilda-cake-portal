import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  redirect("/login");
}
