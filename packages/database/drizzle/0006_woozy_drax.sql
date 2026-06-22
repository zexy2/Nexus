ALTER TABLE "users" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "demo_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "users_demo_expiry_idx" ON "users" USING btree ("is_demo","demo_expires_at");