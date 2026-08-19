ALTER TABLE "reaction_catalog" DROP CONSTRAINT "reaction_catalog_emoji_length";--> statement-breakpoint
ALTER TABLE "reaction_catalog" ADD COLUMN "asset_mime_type" text;--> statement-breakpoint
ALTER TABLE "reaction_catalog" ADD COLUMN "asset_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "reaction_catalog" ADD COLUMN "asset_sha256" text;--> statement-breakpoint
ALTER TABLE "reaction_catalog" ADD COLUMN "asset_storage_key" text;--> statement-breakpoint
ALTER TABLE "reaction_catalog" ADD CONSTRAINT "reaction_catalog_asset_complete" CHECK (("reaction_catalog"."asset_mime_type" IS NULL AND "reaction_catalog"."asset_size_bytes" IS NULL AND "reaction_catalog"."asset_sha256" IS NULL AND "reaction_catalog"."asset_storage_key" IS NULL) OR ("reaction_catalog"."asset_mime_type" IN ('image/jpeg', 'image/gif') AND "reaction_catalog"."asset_size_bytes" > 0 AND char_length("reaction_catalog"."asset_sha256") = 64 AND "reaction_catalog"."asset_storage_key" IS NOT NULL));