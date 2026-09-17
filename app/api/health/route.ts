import { json } from "@/lib/http";
import { readState, demoMode } from "@/lib/repository";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await readState();
    return json({
      application: "ok",
      database: demoMode() ? "demo-file" : "ok",
      mode: demoMode() ? "demo" : "production",
    });
  } catch {
    return json({ application: "degraded", database: "unavailable" }, 503);
  }
}
