CREATE TABLE "user_statuses" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "status" text NOT NULL,
  "global_version" integer DEFAULT 1 NOT NULL,
  "source_event_id" uuid NOT NULL,
  "source_device_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_statuses_value" CHECK ("user_statuses"."status" IN ('available', 'busy', 'focused', 'away', 'invisible', 'in_call', 'gaming', 'sleeping', 'do_not_disturb')),
  CONSTRAINT "user_statuses_global_version" CHECK ("user_statuses"."global_version" >= 1)
);--> statement-breakpoint
ALTER TABLE "user_statuses" ADD CONSTRAINT "user_statuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_statuses" ADD CONSTRAINT "user_statuses_source_device_id_devices_id_fk" FOREIGN KEY ("source_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "status_events" (
  "event_id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "device_id" uuid,
  "status" text NOT NULL,
  "device_version" integer,
  "global_version" integer,
  "created_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "status_events_value" CHECK ("status_events"."status" IN ('available', 'busy', 'focused', 'away', 'invisible', 'in_call', 'gaming', 'sleeping', 'do_not_disturb')),
  CONSTRAINT "status_events_device_version" CHECK ("status_events"."device_version" IS NULL OR "status_events"."device_version" >= 0),
  CONSTRAINT "status_events_global_version" CHECK ("status_events"."global_version" IS NULL OR "status_events"."global_version" >= 1)
);--> statement-breakpoint
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "status_events_user_accepted_at_index" ON "status_events" USING btree ("user_id","accepted_at");--> statement-breakpoint
CREATE INDEX "status_events_device_id_index" ON "status_events" USING btree ("device_id");
