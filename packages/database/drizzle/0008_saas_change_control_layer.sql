CREATE TABLE IF NOT EXISTS "workspace_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "provider" varchar(30) NOT NULL,
  "status" varchar(40) DEFAULT 'not_configured' NOT NULL,
  "external_account_id" varchar(255),
  "external_account_name" varchar(255),
  "installation_id" varchar(255),
  "token_ciphertext" text,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_sync_at" timestamp with time zone,
  "last_error" text,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_integrations_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade,
  CONSTRAINT "workspace_integrations_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_integrations_workspace_provider_idx"
  ON "workspace_integrations" ("workspace_id", "provider");
CREATE INDEX IF NOT EXISTS "workspace_integrations_workspace_idx"
  ON "workspace_integrations" ("workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_integrations_status_idx"
  ON "workspace_integrations" ("status");

CREATE TABLE IF NOT EXISTS "external_issues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "integration_id" uuid,
  "task_id" uuid,
  "provider" varchar(30) NOT NULL,
  "external_id" varchar(255) NOT NULL,
  "external_key" varchar(120),
  "title" varchar(500) NOT NULL,
  "description" text,
  "status" varchar(120) NOT NULL,
  "priority" varchar(40),
  "url" text,
  "team_name" varchar(255),
  "project_name" varchar(255),
  "labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "external_issues_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade,
  CONSTRAINT "external_issues_integration_id_workspace_integrations_id_fk"
    FOREIGN KEY ("integration_id") REFERENCES "workspace_integrations"("id") ON DELETE cascade,
  CONSTRAINT "external_issues_task_id_tasks_id_fk"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE set null
);

CREATE UNIQUE INDEX IF NOT EXISTS "external_issues_workspace_provider_external_idx"
  ON "external_issues" ("workspace_id", "provider", "external_id");
CREATE INDEX IF NOT EXISTS "external_issues_workspace_idx"
  ON "external_issues" ("workspace_id");
CREATE INDEX IF NOT EXISTS "external_issues_task_idx"
  ON "external_issues" ("task_id");
CREATE INDEX IF NOT EXISTS "external_issues_status_idx"
  ON "external_issues" ("status");

CREATE TABLE IF NOT EXISTS "external_pull_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "integration_id" uuid,
  "repository_id" uuid,
  "external_id" varchar(255) NOT NULL,
  "number" integer NOT NULL,
  "title" varchar(500) NOT NULL,
  "status" varchar(80) NOT NULL,
  "url" text,
  "branch" varchar(255),
  "base_branch" varchar(255),
  "latest_commit_sha" varchar(64),
  "linked_external_issue_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "changed_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "external_pull_requests_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade,
  CONSTRAINT "external_pull_requests_integration_id_workspace_integrations_id_fk"
    FOREIGN KEY ("integration_id") REFERENCES "workspace_integrations"("id") ON DELETE cascade,
  CONSTRAINT "external_pull_requests_repository_id_workspace_repositories_id_fk"
    FOREIGN KEY ("repository_id") REFERENCES "workspace_repositories"("id") ON DELETE set null
);

CREATE UNIQUE INDEX IF NOT EXISTS "external_prs_workspace_external_idx"
  ON "external_pull_requests" ("workspace_id", "external_id");
CREATE INDEX IF NOT EXISTS "external_prs_workspace_idx"
  ON "external_pull_requests" ("workspace_id");
CREATE INDEX IF NOT EXISTS "external_prs_repository_idx"
  ON "external_pull_requests" ("repository_id");
CREATE INDEX IF NOT EXISTS "external_prs_status_idx"
  ON "external_pull_requests" ("status");

CREATE TABLE IF NOT EXISTS "external_check_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "pull_request_id" uuid NOT NULL,
  "external_id" varchar(255),
  "name" varchar(255) NOT NULL,
  "status" varchar(80) NOT NULL,
  "conclusion" varchar(80),
  "url" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "external_check_runs_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade,
  CONSTRAINT "external_check_runs_pull_request_id_external_pull_requests_id_fk"
    FOREIGN KEY ("pull_request_id") REFERENCES "external_pull_requests"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "external_check_runs_workspace_idx"
  ON "external_check_runs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "external_check_runs_pr_idx"
  ON "external_check_runs" ("pull_request_id");
CREATE INDEX IF NOT EXISTS "external_check_runs_status_idx"
  ON "external_check_runs" ("status");

CREATE TABLE IF NOT EXISTS "requirement_external_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "requirement_id" uuid NOT NULL,
  "external_issue_id" uuid NOT NULL,
  "confidence" integer DEFAULT 80 NOT NULL,
  "source" varchar(40) DEFAULT 'seed' NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "requirement_external_links_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade,
  CONSTRAINT "requirement_external_links_requirement_id_requirements_id_fk"
    FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE cascade,
  CONSTRAINT "requirement_external_links_external_issue_id_external_issues_id_fk"
    FOREIGN KEY ("external_issue_id") REFERENCES "external_issues"("id") ON DELETE cascade,
  CONSTRAINT "requirement_external_links_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null
);

CREATE UNIQUE INDEX IF NOT EXISTS "requirement_external_links_unique_idx"
  ON "requirement_external_links" ("requirement_id", "external_issue_id");
CREATE INDEX IF NOT EXISTS "requirement_external_links_workspace_idx"
  ON "requirement_external_links" ("workspace_id");
CREATE INDEX IF NOT EXISTS "requirement_external_links_requirement_idx"
  ON "requirement_external_links" ("requirement_id");
CREATE INDEX IF NOT EXISTS "requirement_external_links_issue_idx"
  ON "requirement_external_links" ("external_issue_id");

CREATE TABLE IF NOT EXISTS "impact_graph_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "doc_id" uuid,
  "source_type" varchar(60) NOT NULL,
  "source_id" varchar(255) NOT NULL,
  "target_type" varchar(60) NOT NULL,
  "target_id" varchar(255) NOT NULL,
  "edge_type" varchar(60) NOT NULL,
  "confidence" integer DEFAULT 100 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "impact_graph_edges_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade,
  CONSTRAINT "impact_graph_edges_doc_id_docs_id_fk"
    FOREIGN KEY ("doc_id") REFERENCES "docs"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "impact_graph_edges_workspace_idx"
  ON "impact_graph_edges" ("workspace_id");
CREATE INDEX IF NOT EXISTS "impact_graph_edges_doc_idx"
  ON "impact_graph_edges" ("doc_id");
CREATE INDEX IF NOT EXISTS "impact_graph_edges_source_idx"
  ON "impact_graph_edges" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "impact_graph_edges_target_idx"
  ON "impact_graph_edges" ("target_type", "target_id");

CREATE TABLE IF NOT EXISTS "integration_sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "integration_id" uuid,
  "provider" varchar(30) NOT NULL,
  "status" varchar(40) DEFAULT 'running' NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "error" text,
  "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT "integration_sync_runs_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade,
  CONSTRAINT "integration_sync_runs_integration_id_workspace_integrations_id_fk"
    FOREIGN KEY ("integration_id") REFERENCES "workspace_integrations"("id") ON DELETE set null
);

CREATE INDEX IF NOT EXISTS "integration_sync_runs_workspace_idx"
  ON "integration_sync_runs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "integration_sync_runs_integration_idx"
  ON "integration_sync_runs" ("integration_id");
CREATE INDEX IF NOT EXISTS "integration_sync_runs_provider_status_idx"
  ON "integration_sync_runs" ("provider", "status");
