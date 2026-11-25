CREATE TABLE "ai_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"workspace_id" uuid,
	"name" varchar(120) NOT NULL,
	"agent_type" varchar(60) NOT NULL,
	"provider" varchar(40),
	"model" varchar(120),
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"latency_ms" integer NOT NULL,
	"status" varchar(16) NOT NULL,
	"error_message" varchar(500),
	"tools_used" jsonb,
	"steps" integer
);
--> statement-breakpoint
ALTER TABLE "ai_traces" ADD CONSTRAINT "ai_traces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_traces" ADD CONSTRAINT "ai_traces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_traces_created_idx" ON "ai_traces" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_traces_user_created_idx" ON "ai_traces" USING btree ("user_id","created_at");