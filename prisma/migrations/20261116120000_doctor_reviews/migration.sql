-- Doctor reviews: Review now hangs off the appointment (Encounter belongs to
-- the postponed encounter-emr module and nothing creates encounters).
-- `reviews` had no writer before this migration, so it is expected to be empty;
-- if a row exists the NOT NULL add below fails loudly instead of losing data.
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_encounter_id_fkey";
ALTER TABLE "reviews" DROP COLUMN "encounter_id";
ALTER TABLE "reviews" ADD COLUMN "appointment_id" UUID NOT NULL;
ALTER TABLE "reviews" ALTER COLUMN "status" SET DEFAULT 'PUBLISHED';

CREATE UNIQUE INDEX "reviews_appointment_id_key" ON "reviews"("appointment_id");
CREATE INDEX "reviews_subject_type_subject_id_status_created_at_idx" ON "reviews"("subject_type", "subject_id", "status", "created_at");

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rating is always 1..5 (also enforced by the DTO).
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range_check" CHECK ("rating" BETWEEN 1 AND 5);
