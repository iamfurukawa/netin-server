CREATE TABLE "social_preferences" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "interactions_muted" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "social_preferences" ADD CONSTRAINT "social_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "social_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sender_user_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "protocol_version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "social_events_type" CHECK ("social_events"."type" IN ('reaction', 'message'))
);--> statement-breakpoint
ALTER TABLE "social_events" ADD CONSTRAINT "social_events_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_events" ADD CONSTRAINT "social_events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_events_group_created_at_index" ON "social_events" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "social_events_expires_at_index" ON "social_events" USING btree ("expires_at");
