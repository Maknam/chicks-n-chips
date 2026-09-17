import Kitchen from "@/components/operations";
import { guard } from "@/lib/guard";
export default async function Page() {
  await guard("kitchen");
  return <Kitchen />;
}
