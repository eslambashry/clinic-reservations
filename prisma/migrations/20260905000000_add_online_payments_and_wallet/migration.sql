-- Payments Phase 9 (File 12 Part 50): online gateway payments (card/Fawry/
-- mobile wallet via Paymob, DEC-001) + the internal MedSuper prepaid wallet.
-- Hand-written to match what `prisma migrate dev` would generate — `prisma
-- migrate dev` itself refuses to run non-interactively in this environment
-- (documented in MEMORY.md §8), same as the laboratory-module migration.

-- CreateEnum
CREATE TYPE "payment_intents_method_enum" AS ENUM ('PAY_AT_CLINIC', 'CARD', 'FAWRY', 'MOBILE_WALLET', 'INTERNAL_WALLET');

-- CreateEnum
CREATE TYPE "wallet_transactions_type_enum" AS ENUM ('TOP_UP', 'APPOINTMENT_PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "wallet_transactions_status_enum" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "payment_intents_payable_type_enum" ADD VALUE 'WALLET_TOPUP';

-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN "method" "payment_intents_method_enum" NOT NULL DEFAULT 'PAY_AT_CLINIC';

-- AlterTable
ALTER TABLE "payment_attempts" ADD COLUMN "metadata" JSONB;

-- AlterTable
ALTER TABLE "appointment_holds" ADD COLUMN "payment_intent_id" UUID;

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "type" "wallet_transactions_type_enum" NOT NULL,
    "status" "wallet_transactions_status_enum" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "resulting_balance" DECIMAL(10,2),
    "payment_intent_id" UUID,
    "appointment_id" UUID,
    "idempotency_key" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_holds_payment_intent_id_key" ON "appointment_holds"("payment_intent_id");

-- AddForeignKey
ALTER TABLE "appointment_holds" ADD CONSTRAINT "appointment_holds_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
