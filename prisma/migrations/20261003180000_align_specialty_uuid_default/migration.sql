-- Preserve the UUIDv4 database default deployed by specialty_code_to_uuid.
-- Prisma now declares this database-generated default rather than generating
-- a UUID in the client; existing specialty codes and references do not change.
ALTER TABLE "specialties" ALTER COLUMN "code" SET DEFAULT gen_random_uuid();
