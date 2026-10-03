-- File 12 Part 51 follow-up: preserve the provider actor on requests created
-- through the existing PharmacyOrder queue. Legacy patient orders remain null.
ALTER TABLE "pharmacy_orders"
ADD COLUMN "created_by_user_id" UUID,
ADD COLUMN "created_by_role" "role_memberships_context_type_enum";

CREATE INDEX "pharmacy_orders_created_by_user_id_status_idx"
ON "pharmacy_orders"("created_by_user_id", "status");

ALTER TABLE "pharmacy_orders"
ADD CONSTRAINT "pharmacy_orders_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
