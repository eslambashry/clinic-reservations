-- File 12 Part 55: numeric Fawry merchantRefNum per payment attempt.
-- BIGSERIAL backfills every existing row from the new sequence, so the
-- column can be NOT NULL immediately; existing UUID-referenced Fawry
-- attempts keep working through gateway_reference (legacy webhook lookup).
ALTER TABLE "payment_attempts" ADD COLUMN "fawry_merchant_ref_num" BIGSERIAL NOT NULL;

CREATE UNIQUE INDEX "payment_attempts_fawry_merchant_ref_num_key" ON "payment_attempts"("fawry_merchant_ref_num");
