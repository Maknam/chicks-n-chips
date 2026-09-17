import Admin from "@/components/admin";
import { guard } from "@/lib/guard";
import { permissions, type Area } from "@/lib/auth";
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
