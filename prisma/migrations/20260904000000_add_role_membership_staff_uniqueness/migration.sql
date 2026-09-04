-- Clinic Assistant feature (File 12 Part 05 concurrency-critical-path
-- convention): a DB-enforced guard against duplicate/racy staff
-- provisioning — e.g. two concurrent `POST /v1/provider/assistants` calls
-- for the same phone under the same doctor must not both succeed. Postgres
-- treats each NULL `context_id` as distinct, so this never blocks the
-- existing PATIENT/DOCTOR/ADMIN memberships (`context_id` always null there).
CREATE UNIQUE INDEX "role_memberships_user_id_role_code_context_type_context_id_key" ON "role_memberships"("user_id", "role_code", "context_type", "context_id");

-- Backs the "list this owner's staff" query pattern (context_type +
-- context_id), e.g. GET /v1/provider/assistants scoped to a doctor.
CREATE INDEX "role_memberships_context_type_context_id_idx" ON "role_memberships"("context_type", "context_id");
