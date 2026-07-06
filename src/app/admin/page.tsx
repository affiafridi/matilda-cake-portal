import { redirect } from "next/navigation";

// /admin is now just a redirect to the unified dashboard.
// The role-aware dashboard handles admin/agent/operator views in one place.
export default function AdminHome() {
  redirect("/dashboard");
}
