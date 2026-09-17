import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "./domain";
import { db, demoMode } from "./repository";
import { createHash } from "node:crypto";
export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
export async function handle(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.message }, e.status);
    if (e instanceof ZodError)
      return json({ error: e.issues[0]?.message ?? "Invalid input" }, 400);
    console.error(
      JSON.stringify({
        level: "error",
        event: "request_failed",
        message: e instanceof Error ? e.message : "Unknown error",
      }),
    );
    return json({ error: "Service unavailable. Please try again." }, 503);
  }
}
export function sameOrigin(req: Request) {
  const expected = process.env.APP_ORIGIN || new URL(req.url).origin;
  if (req.headers.get("origin") !== expected)
    throw new DomainError("Invalid request origin", 403);
}
export async function body(req: Request) {
  const text = await req.text();
  if (text.length > 32000) throw new DomainError("Request too large", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError("Invalid JSON");
  }
}
const buckets = new Map<string, { at: number; count: number }>();
export async function rateLimit(req: Request, action: string, max = 30) {
  // The hosting proxy must overwrite x-forwarded-for; never expose the origin directly.
  const key = createHash("sha256")
    .update(
      action +
        ":" +
        (req.headers.get("x-forwarded-for")?.split(",")[0] || "local"),
    )
    .digest("hex");
  if (!demoMode()) {
    const { data, error } = await db().rpc("take_rate_limit", {
      p_key: key,
      p_limit: max,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new DomainError("Too many requests. Wait a minute.", 429);
    return;
  }
  const now = Date.now();
  for (const [key, value] of buckets)
    if (value.at < now - 60000) buckets.delete(key);
  const value = buckets.get(key) ?? { at: now, count: 0 };
  value.count++;
  buckets.set(key, value);
  if (value.count > max)
    throw new DomainError("Too many requests. Wait a minute.", 429);
}
