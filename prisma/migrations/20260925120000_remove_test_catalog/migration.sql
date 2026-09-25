-- Laboratory requests use an uploaded referral; the platform no longer
-- maintains or exposes a selectable test catalog. Preserve historical order
-- item names as snapshots before dropping their catalog foreign key/table.
ALTER TABLE "lab_order_items" DROP CONSTRAINT IF EXISTS "lab_order_items_catalog_code_fkey";

ALTER TABLE "lab_order_items" ADD COLUMN "test_name" TEXT;

UPDATE "lab_order_items" AS item
SET "test_name" = COALESCE(test."display_name", item."catalog_code")
FROM "test_catalog" AS test
WHERE item."catalog_code" = test."code";

UPDATE "lab_order_items"
SET "test_name" = "catalog_code"
WHERE "test_name" IS NULL;

ALTER TABLE "lab_order_items" ALTER COLUMN "test_name" SET NOT NULL;
ALTER TABLE "lab_order_items" DROP COLUMN "catalog_code";
DROP TABLE "test_catalog";
