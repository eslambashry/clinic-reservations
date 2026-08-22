-- File 10 §3.5.1 / File 11 Part 11 / File 12 Part 35.2-35.3: DB-enforced
-- "at most one ACTIVE hold per slot" — not expressible as a Prisma
-- `@@unique` (no filtered/partial unique support), so hand-written here.
-- The application catches the resulting P2002 and returns
-- 409 SLOT_ALREADY_HELD rather than retrying.

CREATE UNIQUE INDEX "appointment_holds_slot_id_active_key" ON "appointment_holds"("slot_id") WHERE "status" = 'ACTIVE';
