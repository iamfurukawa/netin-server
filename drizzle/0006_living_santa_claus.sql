ALTER TABLE "devices" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "devices_last_seen_at_index" ON "devices" USING btree ("last_seen_at");
