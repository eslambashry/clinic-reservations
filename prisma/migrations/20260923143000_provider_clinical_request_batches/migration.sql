-- File 12 Part 51.11: a provider batch is only grouping metadata. Every
-- prescription/lab order remains a standalone patient-owned clinical record
-- and continues through the existing PharmacyOrder/LabOrder lifecycles.
ALTER TABLE "prescriptions" ADD COLUMN "batch_id" UUID;
ALTER TABLE "lab_orders" ADD COLUMN "batch_id" UUID;

CREATE INDEX "prescriptions_batch_id_idx" ON "prescriptions"("batch_id");
CREATE INDEX "lab_orders_batch_id_idx" ON "lab_orders"("batch_id");
