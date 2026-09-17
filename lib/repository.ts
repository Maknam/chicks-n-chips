import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { seed, bid, rid } from "./seed";
import type { State } from "./domain";
export const branchId = () => process.env.BRANCH_ID || bid;
export const restaurantId = () => process.env.RESTAURANT_ID || rid;
export const demoMode = () =>
  process.env.NODE_ENV !== "production" && process.env.DATA_MODE !== "supabase";
export function db() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    throw new Error("Supabase is not configured");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
const filename = path.resolve(
  process.cwd(),
  process.env.DEMO_DATA_FILE || ".data/demo.json",
);
async function readDemo(): Promise<State> {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return seed();
  }
}
export async function readState(): Promise<State> {
  if (demoMode()) return readDemo();
  const { data, error } = await db().rpc("read_branch", {
    p_branch: branchId(),
    p_restaurant: restaurantId(),
  });
  if (error || !data)
    throw new Error(error?.message || "Branch not initialized");
  return data as State;
}
const globalQueue = globalThis as unknown as { ccQueue?: Promise<unknown> };
export async function mutate<T>(fn: (s: State) => T): Promise<T> {
  if (demoMode()) {
    const task = (globalQueue.ccQueue ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const s = await readDemo();
        const result = fn(s);
        s.revision++;
        await mkdir(path.dirname(filename), { recursive: true });
        const temp = filename + "." + randomUUID() + ".tmp";
        await writeFile(temp, JSON.stringify(s));
        await rename(temp, filename);
        return result;
      });
    globalQueue.ccQueue = task;
    return task;
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = await readState();
    const revision = s.revision;
    const result = fn(s);
    s.revision++;
    const { data, error } = await db().rpc("commit_branch", {
      p_branch: branchId(),
      p_restaurant: restaurantId(),
      p_revision: revision,
      p_state: s,
    });
    if (error) throw new Error(error.message);
    if (data) return result;
  }
  throw new Error("Busy kitchen. Please retry.");
}
export function audit(
  s: State,
  action: string,
  actor: string,
  entityId: string,
) {
  s.audits.push({
    id: randomUUID(),
    action,
    actor,
    entityId,
    createdAt: new Date().toISOString(),
  });
}
