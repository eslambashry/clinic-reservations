-- Supports reclaiming stale PROCESSING outbox rows without scanning the
-- entire event history. Notification rows already have a status/lease index.
CREATE INDEX IF NOT EXISTS "outbox_events_status_updated_at_idx"
  ON "outbox_events"("status", "updated_at");
