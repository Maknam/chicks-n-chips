// Page-level access control for staff routes (server components).
import { redirect } from "next/navigation";
import { canAccess, currentStaff, homeFor, type Area } from "./staff";

export async function guard(area: Area) {
  const staff = await currentStaff();
  if (!staff) redirect("/login");
  if (!canAccess(staff.role, area)) redirect(homeFor(staff.role));
  return staff;
}
