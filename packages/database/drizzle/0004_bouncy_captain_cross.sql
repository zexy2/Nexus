CREATE TABLE "document_yjs_snapshots" (
	"doc_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"state" "bytea" NOT NULL,
	"state_vector" "bytea" NOT NULL,
	"update_count" integer DEFAULT 0 NOT NULL,
	"last_sequence" bigint DEFAULT 0 NOT NULL,
	"materialized_content" jsonb,
	"materialized_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_yjs_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_user_id" text,
	"update" "bytea" NOT NULL,
	"sequence" bigserial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_yjs_snapshots" ADD CONSTRAINT "document_yjs_snapshots_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_yjs_snapshots" ADD CONSTRAINT "document_yjs_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_yjs_updates" ADD CONSTRAINT "document_yjs_updates_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_yjs_updates" ADD CONSTRAINT "document_yjs_updates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_yjs_updates" ADD CONSTRAINT "document_yjs_updates_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_yjs_snapshots_workspace_idx" ON "document_yjs_snapshots" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "document_yjs_snapshots_updated_idx" ON "document_yjs_snapshots" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "document_yjs_updates_doc_sequence_idx" ON "document_yjs_updates" USING btree ("doc_id","sequence");--> statement-breakpoint
CREATE INDEX "document_yjs_updates_workspace_idx" ON "document_yjs_updates" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "document_yjs_updates_created_idx" ON "document_yjs_updates" USING btree ("created_at");