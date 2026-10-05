ALTER TABLE notifications
  ADD COLUMN source_event_id UUID,
  ADD COLUMN visible_in_inbox BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN lease_until TIMESTAMPTZ(6),
  ADD COLUMN retry_tokens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN accepted_device_count INTEGER NOT NULL DEFAULT 0;

-- Keep legacy per-channel rows intact; only newly dispatched events use
-- source_event_id and one visible inbox row per event.
CREATE UNIQUE INDEX notifications_source_event_id_user_id_channel_key
  ON notifications(source_event_id, user_id, channel);
CREATE INDEX notifications_status_lease_until_created_at_idx
  ON notifications(status, lease_until, created_at);
