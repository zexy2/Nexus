-- Realtime sync signals via Postgres LISTEN/NOTIFY
--
-- Emits a lightweight notification on the `nexus_changes` channel whenever a
-- doc or task changes, carrying just the affected workspace_id. The SSE
-- endpoint (/api/sync/stream) listens and tells the affected clients to pull
-- immediately, instead of waiting for the 10s poll. Run once:
--   psql "$DATABASE_URL" -f scripts/sync-notify.sql

CREATE OR REPLACE FUNCTION nexus_notify_change() RETURNS trigger AS $$
DECLARE
  ws uuid;
BEGIN
  -- workspace_id of the affected row (NEW on insert/update, OLD on delete)
  ws := COALESCE(NEW.workspace_id, OLD.workspace_id);
  IF ws IS NOT NULL THEN
    PERFORM pg_notify(
      'nexus_changes',
      json_build_object('workspaceId', ws, 'table', TG_TABLE_NAME)::text
    );
  END IF;
  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS docs_notify_change ON docs;
CREATE TRIGGER docs_notify_change
  AFTER INSERT OR UPDATE OR DELETE ON docs
  FOR EACH ROW EXECUTE FUNCTION nexus_notify_change();

DROP TRIGGER IF EXISTS tasks_notify_change ON tasks;
CREATE TRIGGER tasks_notify_change
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION nexus_notify_change();
