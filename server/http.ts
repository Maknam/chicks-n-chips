import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { DomainError } from "@/lib/domain";
import { rateLimits } from "@/db/schema";
import { config } from "./config";
import type { Ctx } from "./context";

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });

/** Wraps a route handler: maps domain/validation errors to 4xx and hides everything else. */
export async function handle(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.message }, e.status);
    if (e instanceof ZodError) return json({ error: e.issues[0]?.message ?? "Invalid input" }, 400);
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

/** CSRF defence for cookie-authenticated writes. */
export function sameOrigin(req: Request) {
  const allowed = config.allowedOrigins();
  const origin = req.headers.get("origin");
  const ok = allowed.length ? allowed.includes(origin ?? "") : origin === new URL(req.url).origin;
  if (!ok) throw new DomainError("Invalid request origin", 403);
}

export async function body(req: Request, limit = 32_000) {
  const text = await req.text();
  if (text.length > limit) throw new DomainError("Request too large", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError("Invalid JSON");
  }
}

const onCloudflare = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/**
 * The caller's address, from the header the host platform sets and clients cannot forge.
 * Cloudflare sets cf-connecting-ip (an x-forwarded-for sent by the client is passed through there,
 * so it is spoofable); Vercel overwrites x-forwarded-for with the real client address.
 */
export function clientIp(req: Request) {
  const raw = onCloudflare
    ? req.headers.get("cf-connecting-ip")
    : req.headers.get("x-forwarded-for")?.split(",")[0];
  return raw?.trim() || "local";
}

/**
 * Fixed one-minute window per action and client IP (or per `subject`, e.g. a phone number,
 * when given), stored in Postgres so it holds across instances.
 */
export async function rateLimit(c: Ctx, req: Request, action: string, max = 30, subject?: string) {
  const ip = clientIp(req);
  const key = createHash("sha256").update(`${action}:${subject ?? ip}`).digest("hex");
  const expired = sql`${rateLimits.windowStart} < now() - interval '1 minute'`;
  const [row] = await c.db
    .insert(rateLimits)
    .values({ key, windowStart: sql`now()`, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${expired} then now() else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count });
  const count = row?.count ?? 0;
  if (count > max) throw new DomainError("Too many requests. Wait a minute.", 429);
}

/** True when the request carries `Authorization: Bearer <WORKER_SECRET or CRON_SECRET>`. */
export function hasWorkerSecret(req: Request) {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  return config.workerSecrets().some((secret) => {
    const expected = Buffer.from(`Bearer ${secret}`);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
