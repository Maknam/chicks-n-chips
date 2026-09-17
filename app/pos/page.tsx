import POS from "@/components/pos";
import { guard } from "@/lib/guard";
export default async function Page() {
  await guard("pos");
  return <POS />;
}
