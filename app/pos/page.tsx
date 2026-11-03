import POS from "@/components/pos";
import { guard } from "@/server/guard";

// Staff pages are per-user and per-request; never prerender them at build time.
export const dynamic = "force-dynamic";
export default async function Page() {
  await guard("pos");
  return <POS />;
}
