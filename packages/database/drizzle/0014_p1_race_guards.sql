ALTER TABLE "agent_executions" ADD COLUMN IF NOT EXISTS "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_webhook_events" ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamp with time zone;--> statement-breakpoint
-- Before enforcing "one active agent job per task", demote any pre-existing
-- duplicates (created by the old check-then-insert race). For each task the
-- most progressed active job is kept (submitted > running > claimed > queued,
-- then most recently updated); the others are moved to "outdated", which is
-- non-terminal and visible in the UI, so a human can cancel them. Rows are not
-- deleted, and an audit event is written for every demoted job.
WITH "ranked" AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "task_id"
      ORDER BY
        CASE "status"
          WHEN 'submitted' THEN 0
          WHEN 'running' THEN 1
          WHEN 'claimed' THEN 2
          ELSE 3
        END,
        "updated_at" DESC,
        "created_at" DESC,
        "id"
    ) AS "rn"
  FROM "agent_jobs"
  WHERE "status" IN ('queued', 'claimed', 'running', 'submitted')
),
"demoted" AS (
  UPDATE "agent_jobs" AS "j"
  SET "status" = 'outdated', "updated_at" = now()
  FROM "ranked" AS "r"
  WHERE "j"."id" = "r"."id" AND "r"."rn" > 1
  RETURNING "j"."id", "j"."workspace_id"
)
INSERT INTO "agent_job_events" ("job_id", "workspace_id", "type", "message", "metadata")
SELECT
  "id",
  "workspace_id",
  'outdated',
  'Another active agent job already exists for this task. This duplicate was paused during migration; cancel it or refresh it once the other job finishes.',
  '{"reason":"duplicate_active_job_migration"}'::jsonb
FROM "demoted";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_jobs_task_active_idx" ON "agent_jobs" USING btree ("task_id") WHERE "agent_jobs"."status" in ('queued', 'claimed', 'running', 'submitted');
