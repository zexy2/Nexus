CREATE TABLE "worker_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" varchar(120) NOT NULL,
	"task_queue" varchar(120) NOT NULL,
	"status" varchar(50) DEFAULT 'healthy' NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_heartbeats_worker_id_idx" ON "worker_heartbeats" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "worker_heartbeats_last_heartbeat_idx" ON "worker_heartbeats" USING btree ("last_heartbeat_at");