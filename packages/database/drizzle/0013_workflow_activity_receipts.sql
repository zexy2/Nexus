CREATE TABLE "workflow_activity_receipts" (
	"idempotency_key" varchar(512) PRIMARY KEY NOT NULL,
	"workflow_id" varchar(255) NOT NULL,
	"activity_type" varchar(80) NOT NULL,
	"workspace_id" uuid,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_activity_receipts" ADD CONSTRAINT "workflow_activity_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_activity_receipts_workflow_idx" ON "workflow_activity_receipts" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_activity_receipts_created_idx" ON "workflow_activity_receipts" USING btree ("created_at");