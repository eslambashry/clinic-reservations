-- 2026-08-29 decision (File 12 Part 39 follow-up, PROPOSED_CONTRACT.md §1
-- resolved in the dashboard's favor): pharmacy staff quote with one flat
-- total instead of pricing PharmacyOrderItem rows individually. Adds the
-- fields the flat quote and whole-order-rejection flows persist directly on
-- pharmacy_orders. PharmacyOrderItem.status/unit_price are left untouched —
-- unused by this flow, not deleted (same "unreachable but present"
-- precedent as AppointmentStatus.HELD).

-- CreateEnum
CREATE TYPE "pharmacy_orders_rejection_reason_enum" AS ENUM ('OUT_OF_STOCK', 'CANNOT_FULFILL', 'OTHER');

-- AlterTable
ALTER TABLE "pharmacy_orders" ADD COLUMN     "total_price" DECIMAL(10,2),
ADD COLUMN     "currency" CHAR(3),
ADD COLUMN     "estimated_ready_minutes" INTEGER,
ADD COLUMN     "staff_note" TEXT,
ADD COLUMN     "quoted_at" TIMESTAMPTZ(6),
ADD COLUMN     "rejection_reason" "pharmacy_orders_rejection_reason_enum",
ADD COLUMN     "rejection_note" TEXT,
ADD COLUMN     "rejected_at" TIMESTAMPTZ(6);
