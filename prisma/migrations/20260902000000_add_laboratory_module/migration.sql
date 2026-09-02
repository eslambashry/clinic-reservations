-- Laboratory module un-postponed (File 12 Part 47, 2026-09-02).
-- Hand-written to match what `prisma migrate dev` would generate for
-- `prisma/schema/laboratory.prisma` + the four new enums added to
-- `shared.prisma` — `prisma migrate dev` itself refuses to run
-- non-interactively in this environment (documented in MEMORY.md §8).

-- CreateEnum
CREATE TYPE "lab_orders_status_enum" AS ENUM ('REQUESTED', 'QUOTED', 'AWAITING_SAMPLE', 'IN_ANALYSIS', 'RESULTS_READY', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "lab_orders_collection_type_enum" AS ENUM ('VISIT', 'HOME_COLLECTION');

-- CreateEnum
CREATE TYPE "lab_order_items_result_state_enum" AS ENUM ('PENDING', 'RECORDED');

-- CreateEnum
CREATE TYPE "lab_result_documents_review_state_enum" AS ENUM ('UNREVIEWED', 'REVIEWED');

-- CreateTable
CREATE TABLE "laboratories" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "tax_id" TEXT,
    "region_code" TEXT,
    "status" "provider_status_enum" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "laboratories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_branches" (
    "id" UUID NOT NULL,
    "laboratory_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "iana_timezone" TEXT NOT NULL,
    "home_collection_capable" BOOLEAN NOT NULL DEFAULT false,
    "status" "provider_status_enum" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "lab_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_catalog" (
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "test_catalog_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "lab_orders" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "lab_branch_id" UUID NOT NULL,
    "prescription_id" UUID,
    "status" "lab_orders_status_enum" NOT NULL DEFAULT 'REQUESTED',
    "collection_type" "lab_orders_collection_type_enum" NOT NULL DEFAULT 'VISIT',
    "total_price" DECIMAL(10,2),
    "currency" CHAR(3),
    "appointment_at" TIMESTAMPTZ,
    "prep_instructions" TEXT,
    "quoted_at" TIMESTAMPTZ,
    "queue_number" INTEGER,
    "booking_code" TEXT,
    "rejection_reason" TEXT,
    "rejection_note" TEXT,
    "rejected_at" TIMESTAMPTZ,
    "recollection_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_order_items" (
    "id" UUID NOT NULL,
    "lab_order_id" UUID NOT NULL,
    "catalog_code" TEXT NOT NULL,
    "unit_price" DECIMAL(10,2),
    "result_state" "lab_order_items_result_state_enum" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "lab_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_result_documents" (
    "id" UUID NOT NULL,
    "lab_order_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "file_label" TEXT NOT NULL,
    "size_kb" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" UUID NOT NULL,
    "is_critical" BOOLEAN NOT NULL DEFAULT false,
    "review_state" "lab_result_documents_review_state_enum" NOT NULL DEFAULT 'UNREVIEWED',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "lab_result_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_order_notes" (
    "id" UUID NOT NULL,
    "lab_order_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_order_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_orders_patient_id_status_idx" ON "lab_orders"("patient_id", "status");

-- CreateIndex
CREATE INDEX "lab_orders_lab_branch_id_status_idx" ON "lab_orders"("lab_branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lab_result_documents_item_id_key" ON "lab_result_documents"("item_id");

-- AddForeignKey
ALTER TABLE "lab_branches" ADD CONSTRAINT "lab_branches_laboratory_id_fkey" FOREIGN KEY ("laboratory_id") REFERENCES "laboratories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_branches" ADD CONSTRAINT "lab_branches_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_lab_branch_id_fkey" FOREIGN KEY ("lab_branch_id") REFERENCES "lab_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_catalog_code_fkey" FOREIGN KEY ("catalog_code") REFERENCES "test_catalog"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_result_documents" ADD CONSTRAINT "lab_result_documents_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_result_documents" ADD CONSTRAINT "lab_result_documents_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "lab_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_result_documents" ADD CONSTRAINT "lab_result_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order_notes" ADD CONSTRAINT "lab_order_notes_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order_notes" ADD CONSTRAINT "lab_order_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
