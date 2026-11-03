import Admin from "@/components/admin";
import { guard } from "@/server/guard";
export default async function Page() {
  await guard("overview");
  return <Admin area="overview" />;
}
