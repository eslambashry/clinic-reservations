-- Convert `specialties.code` from a text catalog key (CARDIOLOGY) to a UUID,
-- matching every other primary key in the schema. The column keeps the name
-- `code` so the API contract (`?specialty=<code>`) is unchanged in shape.
--
-- The old text codes are NOT recoverable from this migration alone. Every
-- row keeps its specialty: the mapping is generated once and applied to
-- `doctors.specialty_code` and `specialties.parent_code` before the swap.
-- (`USING` cannot contain a subquery, so new columns are populated by
-- UPDATE and then swapped into place.)

-- 1. One new UUID per existing specialty, keyed by the old text code.
CREATE TEMPORARY TABLE specialty_code_map (
  old_code text PRIMARY KEY,
  new_code uuid NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO specialty_code_map (old_code)
SELECT code FROM specialties;

-- 2. Drop the FKs so both sides can be retyped.
ALTER TABLE "doctors" DROP CONSTRAINT "doctors_specialty_code_fkey";
ALTER TABLE "specialties" DROP CONSTRAINT "specialties_parent_code_fkey";

-- 3. Add UUID columns alongside the text ones and fill them via the map.
ALTER TABLE "specialties" ADD COLUMN "code_uuid" uuid;
ALTER TABLE "specialties" ADD COLUMN "parent_code_uuid" uuid;
ALTER TABLE "doctors" ADD COLUMN "specialty_code_uuid" uuid;

UPDATE "specialties" s
SET "code_uuid" = m.new_code
FROM specialty_code_map m
WHERE m.old_code = s.code;

UPDATE "specialties" s
SET "parent_code_uuid" = m.new_code
FROM specialty_code_map m
WHERE m.old_code = s.parent_code;

UPDATE "doctors" d
SET "specialty_code_uuid" = m.new_code
FROM specialty_code_map m
WHERE m.old_code = d.specialty_code;

-- Every doctor must have come through the map; abort the whole migration
-- rather than drop a doctor's specialty.
DO $$
DECLARE orphaned int;
BEGIN
  SELECT count(*) INTO orphaned FROM "doctors" WHERE "specialty_code_uuid" IS NULL;
  IF orphaned > 0 THEN
    RAISE EXCEPTION 'specialty remap left % doctor row(s) without a specialty', orphaned;
  END IF;
END $$;

-- 4. Swap the UUID columns into place.
ALTER TABLE "specialties" DROP CONSTRAINT "specialties_pkey";
ALTER TABLE "specialties" DROP COLUMN "code";
ALTER TABLE "specialties" DROP COLUMN "parent_code";
ALTER TABLE "specialties" RENAME COLUMN "code_uuid" TO "code";
ALTER TABLE "specialties" RENAME COLUMN "parent_code_uuid" TO "parent_code";
ALTER TABLE "specialties" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "specialties" ALTER COLUMN "code" SET DEFAULT gen_random_uuid();
ALTER TABLE "specialties" ADD CONSTRAINT "specialties_pkey" PRIMARY KEY ("code");

ALTER TABLE "doctors" DROP COLUMN "specialty_code";
ALTER TABLE "doctors" RENAME COLUMN "specialty_code_uuid" TO "specialty_code";
ALTER TABLE "doctors" ALTER COLUMN "specialty_code" SET NOT NULL;

-- 5. Restore both FKs with the behaviour they had before.
ALTER TABLE "doctors"
  ADD CONSTRAINT "doctors_specialty_code_fkey"
  FOREIGN KEY ("specialty_code") REFERENCES "specialties"("code")
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "specialties"
  ADD CONSTRAINT "specialties_parent_code_fkey"
  FOREIGN KEY ("parent_code") REFERENCES "specialties"("code")
  ON UPDATE CASCADE ON DELETE SET NULL;

DROP TABLE specialty_code_map;
