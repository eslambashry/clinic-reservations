-- Retroactive migration for the password-auth feature merged in PR #2
-- (commit 88ce7da) — the schema change (User.password_hash /
-- password_updated_at) landed without a matching migration file.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "password_updated_at" TIMESTAMPTZ(6);
