ALTER TABLE "social_events" ADD COLUMN "target_user_id" uuid;--> statement-breakpoint
ALTER TABLE "social_events" ADD CONSTRAINT "social_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_events_target_user_id_index" ON "social_events" USING btree ("target_user_id");