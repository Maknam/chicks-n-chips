import { getDb, type Executor } from "@/db/client";
import { config } from "./config";

/** Everything a service needs: where to read/write and which branch it is acting for. */
export type Ctx = { db: Executor; branchId: string };

export const ctx = (): Ctx => ({ db: getDb(), branchId: config.branchId() });

/** Runs `fn` in one database transaction, passing a context bound to it. */
export function transaction<T>(c: Ctx, fn: (tx: Ctx) => Promise<T>): Promise<T> {
  return c.db.transaction((tx) => fn({ ...c, db: tx }));
}
