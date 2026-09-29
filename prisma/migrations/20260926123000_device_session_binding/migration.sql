-- Bind FCM device ownership to the authenticated login session that
-- registered it, so logout can end that ownership atomically and a late
-- registration from an already-ended session is rejected (File 12 Part 53
-- follow-up, 2026-09-26).
--
-- A session is one refresh-token family: rotation inherits `session_id`.
-- Existing tokens become their own session roots; access tokens minted
-- before this migration carry no `sid` claim and must refresh once.
ALTER TABLE refresh_tokens ADD COLUMN session_id UUID;
-- Backfill the *family root*, not each row's own id: older installations
-- already contain rotated refresh-token chains. Logout with a predecessor
-- token must still revoke its active successor after this migration.
WITH RECURSIVE family AS (
  SELECT id, id AS root_id
  FROM refresh_tokens
  WHERE rotated_from_token_id IS NULL
  UNION ALL
  SELECT child.id, parent.root_id
  FROM refresh_tokens child
  JOIN family parent ON child.rotated_from_token_id = parent.id
)
UPDATE refresh_tokens token
SET session_id = COALESCE(family.root_id, token.id)
FROM family
WHERE token.id = family.id;
-- Defensive fallback for a legacy chain whose recorded parent was deleted.
UPDATE refresh_tokens SET session_id = id WHERE session_id IS NULL;
ALTER TABLE refresh_tokens ALTER COLUMN session_id SET NOT NULL;
CREATE INDEX refresh_tokens_session_id_idx ON refresh_tokens(session_id);

-- Nullable: rows registered before this migration have no known session.
-- They are still removed by token-scoped unregister/logout and by
-- all-device logout.
ALTER TABLE devices ADD COLUMN session_id UUID;
CREATE INDEX devices_session_id_idx ON devices(session_id);
CREATE INDEX devices_user_id_idx ON devices(user_id);
