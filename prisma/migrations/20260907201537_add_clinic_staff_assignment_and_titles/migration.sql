-- AlterTable
ALTER TABLE "role_memberships" ADD COLUMN     "subtitle" VARCHAR(200),
ADD COLUMN     "title" VARCHAR(200);

-- CreateTable
CREATE TABLE "clinic_staff_assignments" (
    "id" UUID NOT NULL,
    "role_membership_id" UUID NOT NULL,
    "clinic_branch_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinic_staff_assignments_role_membership_id_idx" ON "clinic_staff_assignments"("role_membership_id");

-- CreateIndex
CREATE INDEX "clinic_staff_assignments_clinic_branch_id_idx" ON "clinic_staff_assignments"("clinic_branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_staff_assignments_role_membership_id_clinic_branch_i_key" ON "clinic_staff_assignments"("role_membership_id", "clinic_branch_id");

-- AddForeignKey
ALTER TABLE "clinic_staff_assignments" ADD CONSTRAINT "clinic_staff_assignments_role_membership_id_fkey" FOREIGN KEY ("role_membership_id") REFERENCES "role_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_staff_assignments" ADD CONSTRAINT "clinic_staff_assignments_clinic_branch_id_fkey" FOREIGN KEY ("clinic_branch_id") REFERENCES "clinic_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "pharmacy_order_broadcasts_branch_response_idx" RENAME TO "pharmacy_order_broadcasts_pharmacy_branch_id_response_idx";

-- RenameIndex
ALTER INDEX "pharmacy_order_broadcasts_order_branch_idx" RENAME TO "pharmacy_order_broadcasts_pharmacy_order_id_pharmacy_branch_idx";
