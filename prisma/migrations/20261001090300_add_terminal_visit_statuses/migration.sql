ALTER TYPE "appointments_visit_status_enum" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "appointments_visit_status_enum" ADD VALUE IF NOT EXISTS 'TIME_EXPIRED';

-- Makes the periodic worker's narrow eligibility query cheap even as the
-- appointment table grows. The slot time remains in appointment_slots.
CREATE INDEX IF NOT EXISTS "appointments_status_visit_status_idx"
  ON "appointments" ("status", "visit_status");
