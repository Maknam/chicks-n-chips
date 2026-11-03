import { timingSafeEqual } from "node:crypto";
import { handle } from "@/server/http";
import { getDb } from "@/db/client";
import { config } from "@/server/config";
import { DomainError } from "@/lib/domain";
import { deliverDue } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

function authorize(req: Request) {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const ok = config.workerSecrets().some((secret) => {
    const expected = Buffer.from(`Bearer ${secret}`);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new DomainError("Unauthorized", 401);
}

const run = (req: Request) =>
  handle(async () => {
    authorize(req);
    return deliverDue({ db: getDb() });
  });

// Vercel Cron sends GET with `Authorization: Bearer $CRON_SECRET`; other schedulers may POST.
export const GET = run;
export const POST = run;
