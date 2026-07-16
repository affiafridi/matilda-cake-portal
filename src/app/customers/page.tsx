import { getCurrentUser } from "@/lib/auth/server";
import CustomersClient from "./CustomersClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await getCurrentUser();
  return <CustomersClient isSuperAdmin={user?.role === "SUPER_ADMIN"} />;
}
