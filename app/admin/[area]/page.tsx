import Admin from "@/components/admin";
import { guard } from "@/server/guard";
import { permissions, type Area } from "@/server/staff";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const { area } = await params;
  if (!(area in permissions) || ["pos", "kitchen"].includes(area)) notFound();
  await guard(area as Area);
  return <Admin area={area} />;
}
