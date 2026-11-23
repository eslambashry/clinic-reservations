-- Service-fee payment flow: SERVICE_FEE policy, hold fee snapshot, manual wallet withdrawals.

-- AlterEnum
ALTER TYPE "policy_configs_policy_type_enum" ADD VALUE 'SERVICE_FEE';
ALTER TYPE "wallet_transactions_type_enum" ADD VALUE 'WITHDRAWAL';
ALTER TYPE "wallet_transactions_type_enum" ADD VALUE 'WITHDRAWAL_REFUND';

-- CreateEnum
CREATE TYPE "withdrawal_requests_status_enum" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED');
CREATE TYPE "withdrawal_requests_payout_method_enum" AS ENUM ('IBAN', 'WALLET_NUMBER');

-- AlterTable: service fee snapshotted at hold time
ALTER TABLE "appointment_holds" ADD COLUMN "service_fee" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" UUID NOT NULL,
    "patient_user_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "withdrawal_requests_status_enum" NOT NULL DEFAULT 'PENDING',
    "account_holder_name" TEXT NOT NULL,
    "payout_method" "withdrawal_requests_payout_method_enum" NOT NULL,
    "payout_account" TEXT NOT NULL,
    "proof_file_url" TEXT,
    "reject_reason" TEXT,
    "processed_by_user_id" UUID,
    "processed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "wallet_transactions" ADD COLUMN "withdrawal_request_id" UUID;

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_created_at_idx" ON "withdrawal_requests"("status", "created_at");
CREATE INDEX "withdrawal_requests_patient_user_id_created_at_idx" ON "withdrawal_requests"("patient_user_id", "created_at");

-- At most one open (PENDING) withdrawal request per patient. Not expressible
-- as a Prisma @@unique (no partial unique support), so hand-written here.
CREATE UNIQUE INDEX "withdrawal_requests_patient_pending_key" ON "withdrawal_requests"("patient_user_id") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_processed_by_user_id_fkey" FOREIGN KEY ("processed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_withdrawal_request_id_fkey" FOREIGN KEY ("withdrawal_request_id") REFERENCES "withdrawal_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
