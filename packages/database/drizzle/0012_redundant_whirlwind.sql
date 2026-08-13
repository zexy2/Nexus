ALTER TABLE "external_write_operations"
  ADD COLUMN IF NOT EXISTS "sync_status" varchar(40) DEFAULT 'not_required' NOT NULL;

ALTER TABLE "external_write_operations"
  ADD COLUMN IF NOT EXISTS "sync_error" text;

CREATE INDEX IF NOT EXISTS "external_write_operations_sync_status_idx"
  ON "external_write_operations" USING btree ("sync_status");
