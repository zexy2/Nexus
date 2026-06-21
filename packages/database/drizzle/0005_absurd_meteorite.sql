ALTER TYPE "public"."task_status" ADD VALUE 'in_review' BEFORE 'done';--> statement-breakpoint
CREATE TABLE "agent_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"token_prefix" varchar(24) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_job_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_job_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"pull_request_url" text NOT NULL,
	"commit_sha" varchar(64) NOT NULL,
	"summary" text NOT NULL,
	"tests" jsonb NOT NULL,
	"acceptance_evidence" jsonb NOT NULL,
	"review_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"plan_version_id" uuid,
	"repository_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'queued' NOT NULL,
	"context_version" integer DEFAULT 1 NOT NULL,
	"context_hash" varchar(64) NOT NULL,
	"context_snapshot" jsonb NOT NULL,
	"claimed_by_client" varchar(120),
	"claimed_by_token_id" uuid,
	"created_by" text,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" varchar(30) DEFAULT 'github' NOT NULL,
	"repository_url" text NOT NULL,
	"repository_owner" varchar(255) NOT NULL,
	"repository_name" varchar(255) NOT NULL,
	"default_branch" varchar(255) DEFAULT 'main' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_access_tokens" ADD CONSTRAINT "agent_access_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_access_tokens" ADD CONSTRAINT "agent_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_job_events" ADD CONSTRAINT "agent_job_events_job_id_agent_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."agent_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_job_events" ADD CONSTRAINT "agent_job_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_job_submissions" ADD CONSTRAINT "agent_job_submissions_job_id_agent_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."agent_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_job_submissions" ADD CONSTRAINT "agent_job_submissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_job_submissions" ADD CONSTRAINT "agent_job_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_repository_id_workspace_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."workspace_repositories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_claimed_by_token_id_agent_access_tokens_id_fk" FOREIGN KEY ("claimed_by_token_id") REFERENCES "public"."agent_access_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_repositories" ADD CONSTRAINT "workspace_repositories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_repositories" ADD CONSTRAINT "workspace_repositories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_access_tokens_hash_idx" ON "agent_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "agent_access_tokens_workspace_idx" ON "agent_access_tokens" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_access_tokens_user_idx" ON "agent_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_job_events_job_idx" ON "agent_job_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "agent_job_events_workspace_idx" ON "agent_job_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_job_submissions_revision_idx" ON "agent_job_submissions" USING btree ("job_id","revision");--> statement-breakpoint
CREATE INDEX "agent_job_submissions_workspace_idx" ON "agent_job_submissions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_jobs_workspace_idx" ON "agent_jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_jobs_task_idx" ON "agent_jobs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "agent_jobs_status_idx" ON "agent_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_repositories_workspace_idx" ON "workspace_repositories" USING btree ("workspace_id");