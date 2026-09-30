-- Rename before any real data exists in this column (added in the immediately
-- preceding migration this session) — a plain RENAME COLUMN keeps the
-- existing FK constraint and index intact, no drop/recreate needed.
ALTER TABLE "prescriptions" RENAME COLUMN "approved_by_user_id" TO "decided_by_user_id";
