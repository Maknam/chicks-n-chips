ALTER TABLE "branches" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "receipt" jsonb DEFAULT '{}'::jsonb NOT NULL;