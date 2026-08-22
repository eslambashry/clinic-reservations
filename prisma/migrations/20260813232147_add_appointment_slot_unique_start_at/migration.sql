-- File 12 Part 33.8: idempotent slot generation needs a DB-level dedup
-- target for `createMany({ skipDuplicates: true })`. Replaces the
-- non-unique index on the same columns with a unique one.

-- Remove any pre-existing duplicate (affiliation, start_at) rows first, so
-- this migration can't fail on a non-empty environment; keeps the earliest
-- row (by created_at, then id as a tiebreaker) of each duplicate set.
DELETE FROM "appointment_slots" a
USING "appointment_slots" b
WHERE a.doctor_clinic_affiliation_id = b.doctor_clinic_affiliation_id
  AND a.start_at = b.start_at
  AND (a.created_at, a.id) > (b.created_at, b.id);

DROP INDEX "appointment_slots_doctor_clinic_affiliation_id_start_at_idx";

CREATE UNIQUE INDEX "appointment_slots_doctor_clinic_affiliation_id_start_at_key" ON "appointment_slots"("doctor_clinic_affiliation_id", "start_at");
