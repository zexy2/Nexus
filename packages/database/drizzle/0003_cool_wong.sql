CREATE TABLE "change_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_set_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requirement_id" uuid,
	"task_id" uuid,
	"action" varchar(40) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"priority" varchar(20),
	"rationale" text NOT NULL,
	"confidence" integer DEFAULT 100 NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"doc_id" uuid NOT NULL,
	"base_version_id" uuid,
	"proposed_version_id" uuid NOT NULL,
	"temporal_workflow_id" varchar(255),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"summary" text NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"doc_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" jsonb,
	"content_text" text NOT NULL,
	"status" varchar(30) DEFAULT 'proposed' NOT NULL,
	"base_version_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"doc_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"stable_key" varchar(40) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"acceptance_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"change_type" varchar(30) DEFAULT 'added' NOT NULL,
	"confidence" integer DEFAULT 100 NOT NULL,
	"previous_requirement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "is_archived" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "alignment_status" varchar(30) DEFAULT 'orphaned' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "alignment_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_change_set_id_change_sets_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."change_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_base_version_id_plan_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_proposed_version_id_plan_versions_id_fk" FOREIGN KEY ("proposed_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_task_links" ADD CONSTRAINT "requirement_task_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_task_links" ADD CONSTRAINT "requirement_task_links_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_task_links" ADD CONSTRAINT "requirement_task_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_task_links" ADD CONSTRAINT "requirement_task_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_proposals_change_set_idx" ON "change_proposals" USING btree ("change_set_id");--> statement-breakpoint
CREATE INDEX "change_proposals_workspace_idx" ON "change_proposals" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "change_proposals_task_idx" ON "change_proposals" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "change_proposals_status_idx" ON "change_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "change_sets_workspace_idx" ON "change_sets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "change_sets_doc_idx" ON "change_sets" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "change_sets_status_idx" ON "change_sets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "change_sets_workflow_idx" ON "change_sets" USING btree ("temporal_workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_versions_doc_version_idx" ON "plan_versions" USING btree ("doc_id","version_number");--> statement-breakpoint
CREATE INDEX "plan_versions_workspace_idx" ON "plan_versions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "plan_versions_doc_idx" ON "plan_versions" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "plan_versions_status_idx" ON "plan_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_task_links_unique_idx" ON "requirement_task_links" USING btree ("requirement_id","task_id");--> statement-breakpoint
CREATE INDEX "requirement_task_links_workspace_idx" ON "requirement_task_links" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "requirement_task_links_task_idx" ON "requirement_task_links" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirements_version_key_idx" ON "requirements" USING btree ("plan_version_id","stable_key");--> statement-breakpoint
CREATE INDEX "requirements_workspace_idx" ON "requirements" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "requirements_doc_idx" ON "requirements" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "requirements_plan_version_idx" ON "requirements" USING btree ("plan_version_id");--> statement-breakpoint
CREATE INDEX "requirements_stable_key_idx" ON "requirements" USING btree ("stable_key");--> statement-breakpoint
CREATE INDEX "tasks_doc_idx" ON "tasks" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "tasks_archived_idx" ON "tasks" USING btree ("is_archived");