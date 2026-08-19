CREATE TABLE "reaction_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reaction_catalog_name_length" CHECK (char_length("reaction_catalog"."name") BETWEEN 1 AND 32),
	CONSTRAINT "reaction_catalog_emoji_length" CHECK (char_length("reaction_catalog"."emoji") BETWEEN 1 AND 16)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reaction_catalog_name_unique" ON "reaction_catalog" USING btree ("name");--> statement-breakpoint
CREATE INDEX "reaction_catalog_active_order_index" ON "reaction_catalog" USING btree ("is_active","display_order");--> statement-breakpoint
INSERT INTO "reaction_catalog" ("name", "emoji", "display_order") VALUES
  ('Gostei', '👍', 10), ('Coracao', '❤️', 20), ('Risada', '😂', 30), ('Festa', '🎉', 40),
  ('Ola', '👋', 50), ('Palmas', '👏', 60), ('Fogo', '🔥', 70), ('Brilho', '✨', 80);
