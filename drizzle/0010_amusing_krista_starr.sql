CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"original_mime_type" text NOT NULL,
	"processed_mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"processing_state" text DEFAULT 'ready' NOT NULL,
	"processing_error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_processing_state" CHECK ("media_assets"."processing_state" IN ('processing', 'ready', 'failed')),
	CONSTRAINT "media_assets_dimensions" CHECK ("media_assets"."width" BETWEEN 1 AND 240 AND "media_assets"."height" BETWEEN 1 AND 320),
	CONSTRAINT "media_assets_size_positive" CHECK ("media_assets"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_key_unique" ON "media_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "media_assets_owner_created_at_index" ON "media_assets" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "media_assets_expires_at_index" ON "media_assets" USING btree ("expires_at");