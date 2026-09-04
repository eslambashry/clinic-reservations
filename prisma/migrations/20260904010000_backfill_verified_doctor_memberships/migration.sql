-- Backfill the DOCTOR role for providers approved before VerifyDoctorUseCase
-- started granting role memberships atomically with verification.
INSERT INTO "role_memberships" (
  "id",
  "user_id",
  "role_code",
  "context_type",
  "context_id",
  "status",
  "created_at",
  "updated_at",
  "version"
)
SELECT
  gen_random_uuid(),
  d."user_id",
  'DOCTOR',
  'DOCTOR'::"role_memberships_context_type_enum",
  NULL,
  'ACTIVE'::"role_memberships_status_enum",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  1
FROM "doctors" AS d
WHERE d."status" = 'VERIFIED'::"doctors_status_enum"
  AND NOT EXISTS (
    SELECT 1
    FROM "role_memberships" AS rm
    WHERE rm."user_id" = d."user_id"
      AND rm."role_code" = 'DOCTOR'
      AND rm."context_type" = 'DOCTOR'::"role_memberships_context_type_enum"
      AND rm."context_id" IS NULL
  );
