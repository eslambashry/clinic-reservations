-- Existing installations may have recorded the same browser token under
-- multiple accounts. Keep only its most recently seen owner before adding
-- the database invariant. Disconnect refresh-token metadata for removed rows.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY fcm_token ORDER BY last_seen_at DESC, created_at DESC, id DESC) AS rank
  FROM devices
)
UPDATE refresh_tokens
SET device_id = NULL
WHERE device_id IN (SELECT id FROM ranked WHERE rank > 1);

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY fcm_token ORDER BY last_seen_at DESC, created_at DESC, id DESC) AS rank
  FROM devices
)
DELETE FROM devices
WHERE id IN (SELECT id FROM ranked WHERE rank > 1);

CREATE UNIQUE INDEX devices_fcm_token_key ON devices(fcm_token);
