CREATE TABLE "media_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"target_user_id" uuid,
	"asset_id" uuid NOT NULL,
	"protocol_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_deliveries" ADD CONSTRAINT "media_deliveries_event_id_media_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."media_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_deliveries" ADD CONSTRAINT "media_deliveries_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_events" ADD CONSTRAINT "media_events_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_events" ADD CONSTRAINT "media_events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_events" ADD CONSTRAINT "media_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_events" ADD CONSTRAINT "media_events_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_deliveries_event_device_unique" ON "media_deliveries" USING btree ("event_id","device_id");--> statement-breakpoint
CREATE INDEX "media_deliveries_device_pending_index" ON "media_deliveries" USING btree ("device_id","acknowledged_at");--> statement-breakpoint
CREATE INDEX "media_deliveries_event_index" ON "media_deliveries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "media_events_group_created_at_index" ON "media_events" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "media_events_asset_id_index" ON "media_events" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "media_events_expires_at_index" ON "media_events" USING btree ("expires_at");