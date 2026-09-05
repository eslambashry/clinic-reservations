-- CreateTable
CREATE TABLE "lab_staff_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lab_branch_id" UUID NOT NULL,
    "role_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "lab_staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy_staff_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pharmacy_branch_id" UUID NOT NULL,
    "role_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pharmacy_staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lab_staff_assignments_role_membership_id_key" ON "lab_staff_assignments"("role_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_staff_assignments_user_id_lab_branch_id_key" ON "lab_staff_assignments"("user_id", "lab_branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_staff_assignments_role_membership_id_key" ON "pharmacy_staff_assignments"("role_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_staff_assignments_user_id_pharmacy_branch_id_key" ON "pharmacy_staff_assignments"("user_id", "pharmacy_branch_id");

-- AddForeignKey
ALTER TABLE "lab_staff_assignments" ADD CONSTRAINT "lab_staff_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_staff_assignments" ADD CONSTRAINT "lab_staff_assignments_lab_branch_id_fkey" FOREIGN KEY ("lab_branch_id") REFERENCES "lab_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_staff_assignments" ADD CONSTRAINT "lab_staff_assignments_role_membership_id_fkey" FOREIGN KEY ("role_membership_id") REFERENCES "role_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_staff_assignments" ADD CONSTRAINT "pharmacy_staff_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_staff_assignments" ADD CONSTRAINT "pharmacy_staff_assignments_pharmacy_branch_id_fkey" FOREIGN KEY ("pharmacy_branch_id") REFERENCES "pharmacy_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_staff_assignments" ADD CONSTRAINT "pharmacy_staff_assignments_role_membership_id_fkey" FOREIGN KEY ("role_membership_id") REFERENCES "role_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: mirror every existing ACTIVE PHARMACY_STAFF/LAB_STAFF
-- role_membership into the new FK-verified tables (7 + 7 rows as of this
-- migration). role_memberships.context_id is untouched and stays the
-- polymorphic column every existing use-case reads the branch id from —
-- this only adds a real, constraint-checked mirror of the same fact.
INSERT INTO "pharmacy_staff_assignments" (
  "id",
  "user_id",
  "pharmacy_branch_id",
  "role_membership_id",
  "created_at",
  "updated_at",
  "version"
)
SELECT
  gen_random_uuid(),
  rm."user_id",
  rm."context_id",
  rm."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  1
FROM "role_memberships" AS rm
WHERE rm."context_type" = 'PHARMACY_STAFF'::"role_memberships_context_type_enum"
  AND rm."status" = 'ACTIVE'::"role_memberships_status_enum"
  AND rm."context_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "pharmacy_staff_assignments" AS psa WHERE psa."role_membership_id" = rm."id"
  );

INSERT INTO "lab_staff_assignments" (
  "id",
  "user_id",
  "lab_branch_id",
  "role_membership_id",
  "created_at",
  "updated_at",
  "version"
)
SELECT
  gen_random_uuid(),
  rm."user_id",
  rm."context_id",
  rm."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  1
FROM "role_memberships" AS rm
WHERE rm."context_type" = 'LAB_STAFF'::"role_memberships_context_type_enum"
  AND rm."status" = 'ACTIVE'::"role_memberships_status_enum"
  AND rm."context_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "lab_staff_assignments" AS lsa WHERE lsa."role_membership_id" = rm."id"
  );
