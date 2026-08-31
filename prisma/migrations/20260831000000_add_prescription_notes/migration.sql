-- Prescription.notes was already accepted by POST /v1/prescriptions/upload's
-- request body but never persisted anywhere. This adds the column so
-- UploadPrescriptionUseCase can actually store it.

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "notes" TEXT;
