-- Patient requests to add a doctor that is not on the platform yet.
CREATE TYPE "doctor_requests_status_enum" AS ENUM ('PENDING', 'IN_REVIEW', 'DOCTOR_ADDED', 'REJECTED');

CREATE TABLE "doctor_requests" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_name" TEXT,
    "clinic_name" TEXT,
    "location" TEXT,
    "specialty" TEXT,
    "contact_phone" TEXT,
    "notes" TEXT,
    "status" "doctor_requests_status_enum" NOT NULL DEFAULT 'PENDING',
    "admin_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "doctor_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "doctor_requests_patient_id_created_at_idx" ON "doctor_requests"("patient_id", "created_at");
CREATE INDEX "doctor_requests_status_created_at_idx" ON "doctor_requests"("status", "created_at");

ALTER TABLE "doctor_requests" ADD CONSTRAINT "doctor_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
