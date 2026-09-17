import { redirect } from "next/navigation";
import { staff, permissions, type Area } from "./auth";
export async function guard(area: Area) {
  const user = await staff();
  if (!user) redirect("/login");
  if (!(permissions[area] as readonly string[]).includes(user.role))
    redirect(user.role === "KITCHEN" ? "/kitchen" : "/pos");
  return user;
}
