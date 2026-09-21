-- AlterEnum
ALTER TYPE "policy_configs_policy_type_enum" ADD VALUE 'MIN_APPOINTMENT_PAYMENT';

-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN "full_amount" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "remaining_balance" DECIMAL(10,2);
