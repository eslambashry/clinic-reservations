-- Kept separate from the enum ADD VALUE migration: PostgreSQL does not make
-- a newly added enum member safe to use until that transaction commits.
UPDATE "appointments"
SET "visit_status" = 'CANCELLED'
WHERE "status" = 'CANCELLED' AND "visit_status" <> 'CANCELLED';
