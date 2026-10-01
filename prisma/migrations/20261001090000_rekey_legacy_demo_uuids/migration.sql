-- Older demo fixtures used UUID values without version/variant bits. PostgreSQL
-- accepted them, but the API's UUID validator rejects IDs returned by branch
-- search, doctor search, and patient lists. Rekey only the known deterministic
-- fixture IDs. Foreign keys use ON UPDATE CASCADE; polymorphic UUID columns
-- (such as role_memberships.context_id) are covered by the second pass.
-- The migration is atomic and a no-op on databases seeded with UUIDv4 IDs.

BEGIN;

CREATE TEMP TABLE legacy_demo_id_map (
  old_id uuid PRIMARY KEY,
  new_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO legacy_demo_id_map (old_id, new_id)
SELECT
  ('00000000-0000-0000-0000-000000000' || suffix)::uuid,
  ('00000000-0000-4000-8000-000000000' || suffix)::uuid
FROM unnest(ARRAY[
  '101','102','103','111','112','113','121','122','123',
  '130','131','132','141','142','150','151','152','161','162',
  '170','171','172','181','182','201','211','221','230','231',
  '232','241','242','250','251','252','261','262','270','271',
  '272','281','282','301','302','303','304','305','306','311',
  '312','313','314','315','316','321','322','323','324','325','326'
]::text[]) AS suffix;

DO $$
DECLARE
  col record;
BEGIN
  -- Update primary keys first so ordinary foreign keys cascade to the new ID.
  -- The second pass also updates UUID references without a foreign key.
  FOR col IN
    SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns AS c
    JOIN information_schema.tables AS t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.udt_name = 'uuid'
    ORDER BY CASE WHEN c.column_name = 'id' THEN 0 ELSE 1 END,
             c.table_name, c.column_name
  LOOP
    EXECUTE format(
      'UPDATE %I.%I AS target SET %I = map.new_id FROM legacy_demo_id_map AS map WHERE target.%I = map.old_id',
      col.table_schema, col.table_name, col.column_name, col.column_name
    );
  END LOOP;
END $$;

COMMIT;
