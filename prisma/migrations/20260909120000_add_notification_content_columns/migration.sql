-- Notifications module (File 12 Part 53): `notifications` has never had a
-- single row written to it yet, so adding required columns is safe.
-- Hand-written to match what `prisma migrate dev` would generate — see
-- MEMORY.md §8 for why migrations are hand-written in this environment.

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "title" TEXT NOT NULL,
                            ADD COLUMN "body" TEXT NOT NULL,
                            ADD COLUMN "data" JSONB,
                            ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
