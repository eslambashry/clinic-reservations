-- AlterEnum
ALTER TYPE "prescriptions_status_enum" ADD VALUE 'PENDING_DOCTOR_APPROVAL';

-- AlterTable
ALTER TABLE "lab_orders" ADD COLUMN     "appointment_id" UUID,
ADD COLUMN     "created_by_user_id" UUID,
ADD COLUMN     "doctor_id" UUID;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "appointment_id" UUID,
ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by_user_id" UUID,
ADD COLUMN     "created_by_role" "role_memberships_context_type_enum",
ADD COLUMN     "created_by_user_id" UUID,
ADD COLUMN     "rejected_at" TIMESTAMPTZ(6),
ADD COLUMN     "rejection_reason" TEXT;

-- CreateIndex
CREATE INDEX "lab_orders_doctor_id_status_idx" ON "lab_orders"("doctor_id", "status");

-- CreateIndex
CREATE INDEX "prescriptions_doctor_id_status_idx" ON "prescriptions"("doctor_id", "status");

-- CreateIndex
CREATE INDEX "prescriptions_created_by_user_id_idx" ON "prescriptions"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

