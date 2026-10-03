-- Keep existing patient-uploaded records compatible while identifying
-- provider-uploaded lab referral images separately from medication Rx.
CREATE TYPE "prescriptions_document_type_enum" AS ENUM ('PRESCRIPTION', 'LAB_REFERRAL');
ALTER TABLE "prescriptions" ADD COLUMN "document_type" "prescriptions_document_type_enum" NOT NULL DEFAULT 'PRESCRIPTION';
