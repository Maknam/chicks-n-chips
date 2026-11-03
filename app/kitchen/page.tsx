import Kitchen from "@/components/operations";
import { guard } from "@/server/guard";

// Staff pages are per-user and per-request; never prerender them at build time.
export const dynamic = "force-dynamic";
export default async function Page() {
  await guard("kitchen");
  return <Kitchen />;
}
