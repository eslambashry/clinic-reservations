-- ADR-005 Part 34.2: persist degree/bio/experience_years collected by the
-- self-registration form onto Doctor (previously accepted and discarded).
-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "degree" TEXT,
ADD COLUMN     "experience_years" INTEGER;
