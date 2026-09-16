-- CreateEnum
CREATE TYPE "appointments_visit_status_enum" AS ENUM ('WAITING', 'IN_DOCTOR_ROOM', 'LEFT');

-- AlterTable
ALTER TABLE "appointments"
ADD COLUMN "visit_status" "appointments_visit_status_enum" NOT NULL DEFAULT 'WAITING';
