CREATE OR REPLACE FUNCTION nexus_notify_change() RETURNS trigger AS $$
DECLARE
  ws uuid;
BEGIN
  ws := COALESCE(NEW.workspace_id, OLD.workspace_id);
  IF ws IS NOT NULL THEN
    PERFORM pg_notify(
      'nexus_changes',
      json_build_object('workspaceId', ws, 'table', TG_TABLE_NAME)::text
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS docs_notify_change ON docs;--> statement-breakpoint
CREATE TRIGGER docs_notify_change
  AFTER INSERT OR UPDATE OR DELETE ON docs
  FOR EACH ROW EXECUTE FUNCTION nexus_notify_change();--> statement-breakpoint

DROP TRIGGER IF EXISTS tasks_notify_change ON tasks;--> statement-breakpoint
CREATE TRIGGER tasks_notify_change
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION nexus_notify_change();--> statement-breakpoint

CREATE INDEX IF NOT EXISTS vectors_embedding_hnsw_idx
  ON vectors USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS docs_embedding_hnsw_idx
  ON docs USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
