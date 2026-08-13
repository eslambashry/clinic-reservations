-- File 12 Part 33.8: idempotent slot generation needs a DB-level dedup
-- target for `createMany({ skipDuplicates: true })`. Replaces the
-- non-unique index on the same columns with a unique one.
DROP INDEX "appointment_slots_doctor_clinic_affiliation_id_start_at_idx";

CREATE UNIQUE INDEX "appointment_slots_doctor_clinic_affiliation_id_start_at_key" ON "appointment_slots"("doctor_clinic_affiliation_id", "start_at");
