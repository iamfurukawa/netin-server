ALTER TABLE "devices" ADD COLUMN "device_credential_hash" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "device_credential_issued_at" timestamp with time zone;
