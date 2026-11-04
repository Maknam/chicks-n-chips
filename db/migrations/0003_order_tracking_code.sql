-- Public tracking codes. New orders get one from the app (crypto RNG, server/tracking.ts);
-- existing orders are backfilled here with random UUID bytes mapped onto the same alphabet.
ALTER TABLE "orders" ADD COLUMN "tracking_code" text;--> statement-breakpoint
-- Random bytes are generated per row in the CTE (a volatile function in a select list runs once per row).
-- Bytes 6 and 8 of a v4 UUID carry the version/variant, so they are skipped.
WITH r AS (
  SELECT id, decode(replace(gen_random_uuid()::text, '-', ''), 'hex') AS b FROM "orders"
)
UPDATE "orders" o SET "tracking_code" = (
  SELECT string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', (get_byte(r.b, i) % 31) + 1, 1), '' ORDER BY i)
  FROM unnest(ARRAY[0, 1, 2, 3, 4, 5, 10, 11, 12, 13]) AS i
)
FROM r WHERE r.id = o.id;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "tracking_code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tracking_code" ON "orders" USING btree ("tracking_code");
