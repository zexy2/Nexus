ALTER TABLE "workspaces" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill (no deletes): mark exactly one existing workspace per owner as the
-- default -- the oldest one, which is what ensureDefaultWorkspace() returned.
-- Any duplicate "default" workspaces created by the old race stay intact as
-- ordinary workspaces (is_default = false) with all their documents/tasks.
UPDATE "workspaces" w
SET "is_default" = true
FROM (
  SELECT DISTINCT ON ("owner_id") "id"
  FROM "workspaces"
  ORDER BY "owner_id", "created_at" ASC, "id" ASC
) oldest
WHERE w."id" = oldest."id";--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_owner_default_idx" ON "workspaces" USING btree ("owner_id") WHERE "workspaces"."is_default";--> statement-breakpoint
CREATE INDEX "workspaces_owner_idx" ON "workspaces" USING btree ("owner_id");
