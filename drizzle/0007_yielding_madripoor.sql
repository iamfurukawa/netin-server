CREATE TABLE "event_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_deliveries" ADD CONSTRAINT "event_deliveries_event_id_social_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."social_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_deliveries" ADD CONSTRAINT "event_deliveries_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_deliveries_event_device_unique" ON "event_deliveries" USING btree ("event_id","device_id");--> statement-breakpoint
CREATE INDEX "event_deliveries_device_pending_index" ON "event_deliveries" USING btree ("device_id","acknowledged_at");--> statement-breakpoint
CREATE INDEX "event_deliveries_event_index" ON "event_deliveries" USING btree ("event_id");