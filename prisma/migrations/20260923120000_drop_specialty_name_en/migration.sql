-- Drop `specialties.name_en`: specialties are now Arabic-only (`name_ar`).
--
-- Safe to drop: the column is display/lookup data only. It was never a key
-- (`code` is the PK), nothing references it by FK, and all read paths
-- (doctor search similarity, API `specialty` fields, registration lookup
-- labels, seed lookups) were moved to `name_ar` in the same change.
--
-- Irreversible: the English names are not recoverable after this runs.
ALTER TABLE "specialties" DROP COLUMN "name_en";
