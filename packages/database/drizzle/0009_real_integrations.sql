CREATE TABLE IF NOT EXISTS "integration_connect_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(30) NOT NULL,
  "state_hash" varchar(128) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "integration_connect_states_hash_idx"
  ON "integration_connect_states" ("state_hash");
CREATE INDEX IF NOT EXISTS "integration_connect_states_workspace_idx"
  ON "integration_connect_states" ("workspace_id");
CREATE INDEX IF NOT EXISTS "integration_connect_states_provider_idx"
  ON "integration_connect_states" ("provider");
CREATE INDEX IF NOT EXISTS "integration_connect_states_expiry_idx"
  ON "integration_connect_states" ("expires_at");

CREATE TABLE IF NOT EXISTS "integration_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE cascade,
  "integration_id" uuid REFERENCES "workspace_integrations"("id") ON DELETE set null,
  "provider" varchar(30) NOT NULL,
  "delivery_id" varchar(255) NOT NULL,
  "event_type" varchar(120) NOT NULL,
  "status" varchar(40) DEFAULT 'queued' NOT NULL,
  "raw_metadata_hash" varchar(128),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "integration_webhook_events_delivery_idx"
  ON "integration_webhook_events" ("provider", "delivery_id");
CREATE INDEX IF NOT EXISTS "integration_webhook_events_workspace_idx"
  ON "integration_webhook_events" ("workspace_id");
CREATE INDEX IF NOT EXISTS "integration_webhook_events_integration_idx"
  ON "integration_webhook_events" ("integration_id");
CREATE INDEX IF NOT EXISTS "integration_webhook_events_status_idx"
  ON "integration_webhook_events" ("status");

CREATE TABLE IF NOT EXISTS "external_write_operations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "change_set_id" uuid REFERENCES "change_sets"("id") ON DELETE cascade,
  "change_proposal_id" uuid REFERENCES "change_proposals"("id") ON DELETE cascade,
  "integration_id" uuid REFERENCES "workspace_integrations"("id") ON DELETE set null,
  "provider" varchar(30) NOT NULL,
  "operation_type" varchar(80) NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(40) DEFAULT 'pending' NOT NULL,
  "response" jsonb,
  "error" text,
  "idempotency_key" varchar(255) NOT NULL,
  "attempted_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_by" text REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "external_write_operations_idempotency_idx"
  ON "external_write_operations" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "external_write_operations_workspace_idx"
  ON "external_write_operations" ("workspace_id");
CREATE INDEX IF NOT EXISTS "external_write_operations_change_set_idx"
  ON "external_write_operations" ("change_set_id");
CREATE INDEX IF NOT EXISTS "external_write_operations_proposal_idx"
  ON "external_write_operations" ("change_proposal_id");
CREATE INDEX IF NOT EXISTS "external_write_operations_status_idx"
  ON "external_write_operations" ("status");
