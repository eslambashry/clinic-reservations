-- 2026-08-29 fullstack-guardian audit follow-up: `pharmacy_orders` and
-- `pharmacy_order_broadcasts` had no index beyond their primary key (the
-- 20260829120000 migration only added columns). The queue-listing queries
-- added in that same pass (`PharmacyOrderRepository.findForPatient`/
-- `findForBranch`) filter on patient_id/pharmacy_branch_id (+ optional
-- status) and would run as full sequential scans as the tables grow — same
-- gap 20260819120000 already fixed once for `appointments`. `findByOrderAndBranch`
-- (queried by `pharmacy_branch_id`+`pharmacy_order_id`) is now a hot path
-- too: `quote`/`reject` call it on every single request since claim/decline
-- got folded into them.

CREATE INDEX "pharmacy_orders_patient_id_status_idx" ON "pharmacy_orders"("patient_id", "status");

CREATE INDEX "pharmacy_orders_pharmacy_branch_id_status_idx" ON "pharmacy_orders"("pharmacy_branch_id", "status");

CREATE INDEX "pharmacy_order_broadcasts_order_branch_idx" ON "pharmacy_order_broadcasts"("pharmacy_order_id", "pharmacy_branch_id");

CREATE INDEX "pharmacy_order_broadcasts_branch_response_idx" ON "pharmacy_order_broadcasts"("pharmacy_branch_id", "response");
