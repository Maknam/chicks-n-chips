// Environment separation: identify Neon branches without credentials; refuse the wrong one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertExpectedDb, describeDb, formatTarget } from "../db/target";

const dev = "postgresql://app:s3cret-dev@ep-small-forest-a1b2c3d4-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require";
const devDirect = "postgresql://app:s3cret-dev@ep-small-forest-a1b2c3d4.eu-west-2.aws.neon.tech/neondb?sslmode=require";
const prod = "postgresql://app:s3cret-prod@ep-proud-river-x9y8z7w6-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require";

test("pooled and direct URLs of one branch share an endpoint id", () => {
  assert.equal(describeDb(dev).endpoint, "ep-small-forest-a1b2c3d4");
  assert.equal(describeDb(devDirect).endpoint, "ep-small-forest-a1b2c3d4");
  assert.equal(describeDb(dev).pooled, true);
  assert.equal(describeDb(devDirect).pooled, false);
});

test("the log summary never contains the password", () => {
  const line = formatTarget(describeDb(prod));
  assert.doesNotMatch(line, /s3cret/);
  assert.doesNotMatch(line, /sslmode/);
});

test("an environment refuses another environment's database", () => {
  assert.doesNotThrow(() => assertExpectedDb(dev, "ep-small-forest-a1b2c3d4"));
  assert.throws(() => assertExpectedDb(prod, "ep-small-forest-a1b2c3d4"), /mismatch/);
  assert.throws(() => assertExpectedDb(dev, "ep-proud-river-x9y8z7w6"), /mismatch/);
  assert.throws(() => assertExpectedDb(prod, "ep-small-forest-a1b2c3d4"), (e: Error) => !/s3cret/.test(e.message));
  assert.doesNotThrow(() => assertExpectedDb(prod, ""), "guard is off until configured");
});

const supaPooler =
  "postgresql://postgres.abcdefghijklmnopqrst:pw-prod@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=certs/ca.crt";
const supaDirect = "postgresql://postgres:pw-prod@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";

test("Supabase pooler and direct URLs resolve to the project ref", () => {
  assert.deepEqual(
    { ...describeDb(supaPooler), host: undefined },
    { endpoint: "abcdefghijklmnopqrst", provider: "supabase", pooled: true, database: "postgres", user: "postgres.abcdefghijklmnopqrst", host: undefined },
  );
  assert.equal(describeDb(supaDirect).endpoint, "abcdefghijklmnopqrst");
  assert.equal(describeDb(supaDirect).pooled, false);
  assert.equal(describeDb(dev).provider, "neon");
  assert.doesNotMatch(formatTarget(describeDb(supaPooler)), /pw-prod|sslrootcert/);
  assert.throws(() => assertExpectedDb(dev, "abcdefghijklmnopqrst"), /mismatch/);
});
