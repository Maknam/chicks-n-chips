// Identifies which database a connection string points at, without exposing credentials.
// - Neon: host `ep-<name>-<id>[-pooler].<region>.aws.neon.tech`; the `ep-…` endpoint id is unique
//   per Neon branch (Development).
// - Supabase: direct host `db.<ref>.supabase.co`, or pooler host `<…>.pooler.supabase.com` with
//   user `postgres.<ref>`; the project ref identifies the project (production).

export type DbTarget = {
  /** Neon endpoint id or Supabase project ref. */
  endpoint: string;
  provider: "neon" | "supabase" | "postgres";
  host: string;
  database: string;
  user: string;
  pooled: boolean;
};

export function describeDb(url: string): DbTarget {
  const u = new URL(url);
  const host = u.hostname;
  const user = decodeURIComponent(u.username);
  const first = host.split(".")[0] ?? "";
  const base = { host, database: u.pathname.replace(/^\//, ""), user };
  if (host.endsWith(".pooler.supabase.com"))
    return { ...base, endpoint: user.split(".")[1] ?? "unknown", provider: "supabase", pooled: true };
  if (host.endsWith(".supabase.co"))
    return { ...base, endpoint: host.split(".")[1] ?? "unknown", provider: "supabase", pooled: false };
  return {
    ...base,
    endpoint: first.replace(/-pooler$/, ""),
    provider: host.endsWith(".neon.tech") ? "neon" : "postgres",
    pooled: first.endsWith("-pooler"),
  };
}

/** One-line summary safe for logs: never includes the password or query string. */
export const formatTarget = (t: DbTarget) =>
  `${t.provider} endpoint=${t.endpoint} database=${t.database} user=${t.user} ${t.pooled ? "pooled" : "direct"}`;

/**
 * Refuses a connection string that belongs to a different environment. Each environment sets
 * DATABASE_ENDPOINT to its own database id (public, not a secret): the Neon Development endpoint
 * id for development/Preview, the Supabase project ref for production migrations.
 */
export function assertExpectedDb(url: string, expected = process.env.DATABASE_ENDPOINT?.trim()) {
  if (!expected) return;
  const { endpoint } = describeDb(url);
  if (endpoint !== expected)
    throw new Error(
      `Database endpoint mismatch: this environment expects ${expected} but DATABASE_URL points at ${endpoint}. Refusing to connect.`,
    );
}
