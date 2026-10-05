-- Appointment terminal-status reconciliation (PM-APPT-04, approved 2026-10-03)
--
-- NOT a Prisma migration on purpose: files under prisma/migrations/ run
-- automatically on `prisma migrate deploy`. This one changes historical
-- business records, so it is run by hand, once per environment, only with
-- explicit authorization for that environment (never against live/shared
-- production data without it).
--
-- What it does (lifecycle columns only; no payment, refund, ledger or
-- wallet row is touched — V1 no-show rule):
--   1. CONFIRMED + visit LEFT          -> status COMPLETED
--      (what UpdateAppointmentVisitStatusUseCase now does at LEFT time)
--   2. CONFIRMED + visit TIME_EXPIRED  -> status NO_SHOW
--      TIME_EXPIRED has exactly one writer, the waiting-visit expiry sweep,
--      and on a CONFIRMED row it was only ever set from WAITING after slot
--      end + APPOINTMENT_END_GRACE_MINUTES, i.e. "never admitted in the
--      system". Caveat: a patient who was seen but never marked
--      IN_DOCTOR_ROOM by staff is indistinguishable here.
-- Left alone and only reported: CONFIRMED rows still IN_DOCTOR_ROOM (an
-- open visit nobody closed) — closing them needs a human decision per row.
--
-- Usage (psql):
--   psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -v apply=0 -f <this file>   -- dry run: report, then ROLLBACK
--   psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -v apply=1 -f <this file>   -- apply: same, then COMMIT
-- Idempotent: a second run matches 0 rows.

\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

\echo '--- before'
SELECT status, visit_status, count(*) AS rows
FROM appointments
WHERE status = 'CONFIRMED' AND visit_status IN ('LEFT', 'TIME_EXPIRED', 'IN_DOCTOR_ROOM')
GROUP BY status, visit_status
ORDER BY visit_status;

WITH completed AS (
  UPDATE appointments
  SET status = 'COMPLETED', version = version + 1, updated_at = now()
  WHERE status = 'CONFIRMED' AND visit_status = 'LEFT'
  RETURNING id
)
SELECT 'CONFIRMED+LEFT -> COMPLETED' AS change, count(*) AS rows FROM completed;

WITH no_shows AS (
  UPDATE appointments
  SET status = 'NO_SHOW', version = version + 1, updated_at = now()
  WHERE status = 'CONFIRMED' AND visit_status = 'TIME_EXPIRED'
  RETURNING id
)
SELECT 'CONFIRMED+TIME_EXPIRED -> NO_SHOW' AS change, count(*) AS rows FROM no_shows;

\echo '--- still open visits (reported, not changed)'
SELECT a.id, s.start_at
FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id
WHERE a.status = 'CONFIRMED' AND a.visit_status = 'IN_DOCTOR_ROOM'
ORDER BY s.start_at
LIMIT 50;

\if :apply
  COMMIT;
  \echo 'APPLIED'
\else
  ROLLBACK;
  \echo 'DRY RUN — rolled back (pass -v apply=1 to commit)'
\endif
