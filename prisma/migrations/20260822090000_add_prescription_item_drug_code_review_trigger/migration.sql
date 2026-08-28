-- File 10 §7.3 / File 11 Part 09.3 / File 12 Part 37: "OCR-never-trusted-alone"
-- is a hard rule, not application-layer discipline — File 12 Part 10 explicitly
-- requires a real DB constraint/check. Postgres CHECK constraints cannot
-- reference another table, so this is a trigger instead: no
-- prescription_items row may have a non-null drug_code unless a
-- prescription_reviews row already exists for that prescription. Not
-- expressible in schema.prisma, hand-written here (same reason as the
-- appointment_holds partial unique index migration).

CREATE OR REPLACE FUNCTION enforce_prescription_item_drug_code_requires_review()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.drug_code IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM "prescription_reviews" WHERE "prescription_id" = NEW."prescription_id") THEN
      RAISE EXCEPTION 'prescription_items.drug_code cannot be set without a corresponding prescription_reviews row (OCR-never-trusted-alone rule, File 10 section 7.3)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_prescription_item_drug_code_requires_review"
BEFORE INSERT OR UPDATE ON "prescription_items"
FOR EACH ROW EXECUTE FUNCTION enforce_prescription_item_drug_code_requires_review();
