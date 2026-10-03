# MedSuper V1 Launch Readiness

The single canonical launch-readiness source for both `clinic-reservations`
(backend) and `med-super` (Flutter). It holds the evidence log, issue
register, PM decision register and V1 feature readiness matrix. Update it in
place; do not fork it into per-repo or per-date copies.

Plan: *MedSuper Backend and Flutter Launch-Readiness Master Plan* (started 2026-10-03).

| | Backend `clinic-reservations` | Flutter `med-super` |
|---|---|---|
| Baseline ref | `staging` @ `894cba6` | `staging` @ `9537165` (the plan recorded `93ebe2e`, which is not on the remote; `staging` had moved) |
| Working branch | `claude/medsuperv1-launch-readiness-4hgv73` | `claude/medsuperv1-launch-readiness-4hgv73` |

Status words used below: `PRODUCTION READY`, `NEEDS HARDENING`,
`PM DECISION REQUIRED`, `FEATURE FLAGGED`, `FUTURE`, `BLOCKED`. `UNVERIFIED`
marks anything without evidence yet. "Implemented", "tested" and "verified"
are not the same thing and are not used interchangeably here.

---

## 1. Evidence log

All runs were in a cloud container, Node 22.22, Flutter 3.47.4, Dio 5.11.0.

### Baseline (before any change)

| Check | Result |
|---|---|
| Backend `npm test` | 12 suites failed / 157 passed; 57 tests failed / 931 passed. 9 of the failing suites were `*.integration.spec.ts` that tried to reach the `.env` database (placeholder host, unreachable) |
| Backend `npm run lint` | 0 errors, 1 warning (`update-user-profile.use-case.ts:37` unused `_dropped`) |
| Backend `npm run build` | pass |
| Flutter `flutter analyze` | 0 errors, 6 warnings (`unused_result` on `ref.refresh` in orders/lab/pharmacy screens), 98 info = 104. *Corrected 2026-10-03: the first recording said "0 warnings" because of a grep pattern error; re-run on `staging` confirms 6.* |
| Flutter `flutter test` | 486 passed, 1 failed (`detail_screens_test.dart`: "a future appointment explains that visit controls are not ready") |

### After this batch

| Check | Environment | Result |
|---|---|---|
| Backend `npm test` (unit only now) | no database | 160 suites / 952 tests pass |
| Backend `npm run test:integration` | disposable local Postgres 16 + PostGIS 3.4 (port 55432) and Redis (port 56379), `prisma migrate deploy` (48 migrations) + `npm run db:seed` | 9 suites / 47 tests pass, three consecutive runs, each with 30 forced handler-less PENDING outbox events |
| Backend `npm run lint` / `build` | — | unchanged: 1 warning / pass |
| Flutter `flutter test` | — | all pass (adds 9 timezone, 11 transport and 2 reschedule-contract tests) |
| Flutter `flutter analyze` | — | unchanged from baseline: 0 errors, 6 warnings, 98 info |
| Backend `npm run test:e2e` | same disposable DB | 5 suites / 110 tests pass (§1.1) |

Mutation checks: reverting the outbox SKIPPED/fencing behavior fails 3 and 2
outbox tests respectively; restoring the old Flutter `AuthInterceptor` fails
the concurrent-401 and replay-5xx tests; the timezone tests fail 5/9 against
the old fixed-offset code.

### Appointment-rules batch (PM-APPT-01..05, 2026-10-03)

| Check | Environment | Result |
|---|---|---|
| Backend `npm test` | no database | 990 tests pass |
| Backend `npm run test:integration` | disposable stack (re-started after a session restart; same migrated + seeded cluster) | 54 tests pass, incl. 7 new lifecycle cases on real Postgres |
| Backend `npm run test:e2e` | same | 111 tests pass |
| Backend lint / build | — | 1 pre-existing warning / pass |
| Reconciliation script dry run, apply, re-run | disposable DB with seeded historical rows | dry run reports + rolls back; apply changes 2 + 2 rows; re-run 0; open visit and waiting row untouched |
| Flutter `flutter test` / `analyze` | — | all pass / unchanged (0 errors, 6 warnings, 98 info) |

Mutation check: removing `visit_status: 'WAITING'` from the repository's
booking-change `WHERE` fails the race test on real Postgres.

### 1.1 E2E

`npm run test:e2e` on the same disposable stack: 5 suites / 110 tests pass
(doctor dashboard, provider assistants, provider clinical requests,
scheduling availability, provider directory). Baseline: 2 failures, both
stale expectations against deliberate rule changes (LR-022).

### Not run / environment limits

- No production, staging or shared database was touched. The `.env` in the
  backend checkout holds placeholder hosts only.
- Docker daemon unavailable; the disposable Postgres was a local `initdb`
  cluster under `/var/tmp`. One cluster died mid-run when its scratch data
  directory's permissions were reset (environmental, not a product failure);
  it was rebuilt and all evidence above comes from the rebuilt cluster.
- No Android SDK signing, no iOS/macOS toolchain, no emulator or device: no
  rendered-UI, release-build or device evidence exists yet.
- No real provider credentials (SMS, FCM, Paymob, ImageKit).

---

## 2. Issue register

| ID | Surface | Type | Pri | Status |
|---|---|---|---|---|
| LR-001 | backend tests | environment / safety | P1 | Fixed |
| LR-002 | backend outbox | stale test | P2 | Fixed |
| LR-003 | backend notifications | stale test | P2 | Fixed |
| LR-004 | backend errors | stale test | P3 | Fixed |
| LR-005 | backend notifications | stale test (order-dependent) | P2 | Fixed |
| LR-006 | backend pharmacy | stale test (timing-dependent) | P2 | Fixed |
| LR-007 | Flutter provider dashboard | stale test | P2 | Fixed; test now pins the approved PM-APPT-03 rule |
| LR-008 | Flutter booking | defect (timezone) | P1 | Fixed |
| LR-009 | Flutter transport | defect (retry) | P2 | Fixed |
| LR-010 | Flutter transport | defect (auth/session) | P1 | Fixed |
| LR-011 | appointments | product decision / financial | P0 | Fixed (PM-APPT-01/02 approved and implemented) |
| LR-012 | appointments | product decision | P1 | Fixed (PM-APPT-04); historical rows need the reviewed script, not yet run anywhere shared |
| LR-013 | appointments / assistants | product decision / authz | P1 | Fixed (PM-APPT-05); original finding partly wrong, see below |
| LR-014 | appointments visit status | product decision | P2 | Fixed (PM-APPT-03) |
| LR-015 | appointments booking | defect candidate | P2 | Open, reproduction pending |
| LR-016 | notifications safety-critical | release gate / product | P1 | Open |
| LR-017 | Prisma schema | contract drift | P3 | Open |
| LR-018 | Flutter dates | hardening | P2 | Open |
| LR-019 | docs | stale documentation | P3 | Open (Phase 5) |
| LR-020 | release | external gates | P1 | Open, see §5 |
| LR-021 | Flutter ↔ backend reschedule | contract mismatch | P1 | Fixed |
| LR-022 | backend e2e | stale test | P2 | Fixed |

### LR-001 — `npm test` wrote to whatever database `.env` named

- **Evidence**: `jest.config.js` matched every `*.spec.ts`, including nine
  `*.integration.spec.ts` that call `dotenv.config()` and then create and
  delete users, wallets, appointments and outbox rows. There is no CI
  workflow, so `npm test` is only run by hand, against whatever `.env`
  points at (a shared Neon branch, staging, or production).
- **Repair**: `npm test` now excludes `*.integration.spec.ts`. New
  `npm run test:integration` (`jest.integration.config.js`), plus
  `test:e2e`, load `test/require-disposable-db.js`, which refuses to start
  without `TEST_DATABASE_URL`, refuses a value equal to `.env`'s
  `DATABASE_URL`/`DIRECT_URL`, and swaps it in before any spec loads.
  `TEST_REDIS_URL` does the same for Redis.
- **Verification**: positive, both suites ran green against the disposable DB.
  Negative, `test:integration` with no `TEST_DATABASE_URL` fails before any
  spec runs, and `npm test --listTests` contains no integration spec.

### LR-002…LR-006 — stale backend tests

- **LR-002** `outbox.worker.spec.ts` still asserted the pre-fencing `update`
  calls and a one-argument handler. Rewritten (12 tests) around current
  behavior: fenced `updateMany` (`status='PROCESSING'` + claim `updated_at`),
  SKIPPED with the claim attempt refunded, never back to PENDING, event-id
  propagation, PENDING-without-recount under `MAX_ATTEMPTS`, FAILED at
  `MAX_ATTEMPTS`, stale-worker no-op, dead-lettering and claim accounting in
  `claimBatch`, no overlapping drains. Runtime unchanged.
- **LR-003** `dispatch-notification.use-case.spec.ts` assumed PUSH+SMS
  templates; every production template is PUSH-only today. The per-channel
  mechanism (opt-out, single inbox row, replay without re-delivery) is now
  tested with two fixture templates, real templates are pinned to PUSH, and
  new cases cover disabled TRANSACTIONAL PUSH (no row) and disabled
  SAFETY_CRITICAL PUSH (still delivered).
- **LR-004** `EMAIL_NOT_EDITABLE` and `VISIT_STATUS_MANAGED_BY_SYSTEM` were
  thrown with Arabic messages but missing from `AR_ERROR_MESSAGES`; added
  with the throw sites' exact wording.
- **LR-005** `notification-reliability` drained the shared outbox table once
  and expected its own event to be in the first `BATCH_SIZE` (20) rows. Any
  older backlog made it fail (reproduced with 30 backlog rows). The test now
  drains until its event is claimed (bounded at 50 drains).
- **LR-006** pharmacy races 3–5 expected the loser to always get
  `OptimisticLockError`; when the loser reads after the winner commits it
  correctly gets the transition's 422 instead. `expectLostRace` accepts
  exactly those two outcomes. The row-state assertions (one winner, correct
  final state/version) are unchanged.

### LR-007 — Flutter visit-status hint test

`9bd5f7c` (2026-09-25) deliberately removed the client's visit-status time
window; the backend never had one. The test now pins current behavior
(future appointment offers the next action) and points at PM-APPT-03.
The `available_near_time`/`outside_window` translation keys are unused but
kept in case PM-APPT-03 reinstates a window.

### LR-008 — Patient slot times one hour early during Egyptian DST

- **Evidence**: `slot_grouping.dart` used a fixed `+02:00` for
  `Africa/Cairo` ("Egypt has observed no DST since 2014"). Egypt reinstated
  DST in 2023. The backend (luxon, ICU tzdata 2025b) generates slots with
  real rules: 2026-10-03T07:00Z is 10:00 in the clinic, the app showed 09:00.
  Wrong from the last Friday of April to the last Thursday of October, i.e.
  on the day this plan started. Day grouping and "today/tomorrow" were also
  wrong around midnight.
- **Repair**: `lib/core/utils/iana_zone.dart` resolves the branch's
  `ianaTimezone` with the `timezone` package (IANA 2025b, same release as
  the backend; already a transitive dependency via
  `flutter_local_notifications`, now direct). `slot_grouping.dart` and the
  dev mock's slot generator use it. Unknown/missing zones still render as
  explicitly labelled UTC; the device zone is never used.
- **Verification**: `test/features/provider_profile/domain/slot_grouping_test.dart`
  covers summer, winter, both 2026 DST transitions, the day boundary,
  clinic-time "today", unknown zone, null zone and a non-Cairo zone. 5 of 9
  failed before the fix.

### LR-009 — 5xx retry never ran

- **Evidence** (installed Dio 5.11.0): error interceptors run in add-order,
  and `handler.reject()` defaults to `callFollowingErrorInterceptor: false`.
  `ErrorInterceptor` rejected, so `RetryInterceptor` (added after it) never
  saw any error that had a response. Reproduced through the real
  `buildDioClient` chain with a scripted transport: GET 503 and keyed POST 502
  each produced one transport call. `dio_client.dart` documented the
  opposite order.
- **Repair**: `ErrorInterceptor` hands its normalized error on with
  `handler.next`; the ordering comment is corrected.
- **Safety**: retry stays limited to GET and POSTs carrying an
  `Idempotency-Key`, which is reused across attempts. The backend's
  idempotency interceptor releases the key on handler error (safe
  re-execution), replays the cached response if the first attempt actually
  completed, and answers `409 IDEMPOTENCY_KEY_REUSE` while it is still
  running, so no duplicate write is possible.
- **Verification**: `test/core/network/dio_client_chain_test.dart`: GET
  503→200 retried; keyed POST retried with the same key; un-keyed POST never
  retried; bounded at 1+3 attempts surfacing `ApiException`; 4xx never
  retried.

### LR-010 — Concurrent token expiry failed requests; a server error during replay logged the user out

- **Evidence**: `AuthInterceptor` used an `_isRefreshing` skip flag, so a
  second request that got 401 during a refresh failed with 401 instead of
  waiting (e.g. several screens loading on app resume). The replay of the
  original request ran inside the same `try` as the refresh, so a 5xx or
  timeout on the replay hit `catch (_) { clearTokens() }`, i.e. logout on a
  server error. Both reproduced through the real chain.
- **Repair**: single-flight refresh (one shared future), replay with the
  stored token if another request already refreshed, one refresh per request
  (no loops), and tokens are cleared only when the refresh itself fails. One
  refresh per burst matters: the backend revokes every session when a
  rotated refresh token is replayed.
- **Verification**: five auth tests in `dio_client_chain_test.dart`; the two
  concurrency/replay tests fail against the old interceptor.

### LR-011 — Attended or past appointments can be cancelled (refund) or rescheduled (new visit, same payment)

- **Evidence**: `CancelAppointmentUseCase` and `RescheduleAppointmentUseCase`
  require only `status === 'CONFIRMED'`. No time check, no visit-status check.
  Nothing ever moves an appointment out of `CONFIRMED` (LR-012).
- **Reproduction** (disposable DB, real use-cases, throwaway spec not
  committed): a PAY_AT_CLINIC appointment on 2026-09-02, visit `LEFT`,
  cancelled by its patient on 2026-10-03 → `CANCELLED`, refund 90 / fee 10.
  A second attended appointment rescheduled to 2026-11-02 → new `CONFIRMED`
  appointment, visit `WAITING`, same `payment_intent_id`.
- **Exposure**: Flutter hides the patient Cancel button unless
  `CONFIRMED`+`WAITING` (`AppointmentSummary.isCancellable`), so this is
  reachable through the API with the patient's own token, a stale client, or
  before the 5-minute `TIME_EXPIRED` job runs. The client check is not an
  authorization boundary.
- **Candidate implementation**: unmerged branch
  `feat/lock-appointment-changes-after-visit-start` (`8642082`) blocks cancel
  and reschedule unless `visit_status = WAITING`, in the use-cases and in
  the repository `WHERE`. It covers the in-room/left case but not the
  past-and-never-attended case.
- **Resolution** (`7c5a55c` backend, `c35e5d9` Flutter): every actor needs
  `CONFIRMED` + `WAITING`; a patient also needs `now < start_at`. Both are
  checked in the use-cases and repeated in the repository `WHERE`. The
  unmerged branch was adapted, not merged: its `canChangeBooking`, guards,
  copy and e2e checks were taken over; PM-APPT-01/05 were added on top.
  The two reproduced holes are now permanent integration tests that assert
  422 and an unchanged row, refund count, slot and replacement count.

### LR-012 — Appointment status never reaches COMPLETED / NO_SHOW

`AppointmentStatus` has `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `NO_SHOW`,
but no runtime path sets them (only seed data). Visit progress lives in
`visit_status`; `ExpireWaitingVisitsUseCase` moves overdue `WAITING` visits to
`TIME_EXPIRED` but leaves `status` at `CONFIRMED`. Pharmacy order creation
and fulfilment accept `COMPLETED` appointments, so they are written for a
status nothing produces. → Resolved by PM-APPT-04: `LEFT` writes
`COMPLETED` in the same update; the sweep writes `NO_SHOW` only on
still-`CONFIRMED` unattended rows (it also stamps `TIME_EXPIRED` on finished
`COMPLETED`/`RESCHEDULED` rows for reconciliation, which is why
`TIME_EXPIRED` alone does not mean no-show). No money moves on `NO_SHOW`.
Historical rows: `prisma/data-migrations/20261003_appointment_terminal_status_reconciliation.sql`
(dry run by default; not under `prisma/migrations/`, so `migrate deploy`
never runs it). **Not run against any shared/live database — needs explicit
authorization per environment.**

### LR-013 — Assistant (CLINIC_STAFF) authority is broader than documented

*Correction (2026-10-03):* the first write-up said assistants could act on
"all of their doctor's branches". That was wrong. `ResolveDoctorScopeUseCase`
already narrows a `CLINIC_STAFF` caller to the branches in
`clinic_staff_assignments` (unique per membership and branch), and an
assistant with no assignment sees nothing, so the branch scope PM-APPT-05
asks for already existed and no schema change was needed. What was true:
an assistant could cancel (full refund) on their own. Now provider
cancellation is `DOCTOR`-only at the route and in the use-case, and e2e
tests prove assistant cancel 403, out-of-branch reschedule/visit 404 and
in-branch reschedule 200.

### LR-014 — Visit status has no time window

Either side could mark a next-month appointment `WAITING → IN_DOCTOR_ROOM`
today. → Resolved by PM-APPT-03 (see §3).

### LR-015 — Holds on slots whose start time has passed (candidate)

`CreateHoldUseCase` checks that the slot is `OPEN`, not that it is in the
future. Not reproduced yet; checking whether past slots stay `OPEN` and are
reachable is the next step. Overlaps with PM-APPT-01 (minimum booking
lead time).

### LR-016 — SAFETY_CRITICAL lab result is push-only

`CriticalLabResult` is `SAFETY_CRITICAL` and PUSH-only. With no SMS provider
(File 10 Part 4 open decision) and FCM not yet verified in production, a
patient with no registered device gets only an inbox row. Needs either a
verified FCM path plus a stated fallback, or an explicit product acceptance.

### LR-017 — Schema drift on `specialties.code`

Migration `20260923140000_specialty_code_to_uuid` leaves
`DEFAULT gen_random_uuid()` on `specialties.code`; `prisma/schema` has no
default, so `prisma migrate diff` reports `ALTER COLUMN "code" DROP DEFAULT`
and the next `migrate dev` would generate it. Decide which side is intended
and align it in a reviewed migration (not a rewrite of the existing one).

### LR-018 — Appointment times rendered in the device zone

Patient appointment detail, reschedule, pharmacy review and several provider
dashboard screens format UTC instants with `toLocal()`. Correct for devices
set to Egyptian time; wrong for a patient or doctor whose phone is in
another zone. The slot picker now uses the branch zone (LR-008); the rest
should follow with `ianaLocation`.

### LR-019 — Stale documentation (Phase 5)

- `med-super/CLAUDE.md` still says the backend is capped at Phase 3 and
  calls `provider_dashboard` mock-only, and lists `features/` without
  `appointments`, `notifications`, `wallet`, which exist.
- `ResolveAppointmentScopeUseCase` / `CancelAppointmentUseCase` comments say
  CLINIC_STAFF is deferred (LR-013).
- `clinic-reservations/CLAUDE.md` "Project state" describes phases that later
  sections and the code have moved past.

### LR-020 — External release gates

See §5.

### LR-021 — Patient reschedule broke against backend `staging`

- **Evidence**: backend `894cba6` (the `staging` head, 2026-10-03) made
  patient reschedule one step: it returns `{status: 'CONFIRMED',
  appointmentId, slotId, previousAppointmentId}` and carries the original
  payment over. Flutter `staging` still parsed the old hold shape
  (`json['holdId'] as String`, which throws on null) and then sent the user
  to `BookingConfirmScreen` to confirm and pay. Result: the server
  rescheduled, the app reported a failure, and a retry hit 422 on the
  now-`RESCHEDULED` appointment.
- **Repair** (Flutter): `RescheduledAppointmentDto`/`RescheduledAppointment`;
  datasource, repository and use-case return it; `RescheduleScreen` goes
  straight to a "rescheduled" success screen (new `reschedule_confirmed*`
  keys in `en`/`ar`); the reschedule-only `BookingConfirmArgs`/`initialHold`
  path is removed; the dev mock returns the real shape and creates the
  replacement appointment.
- **Verification**: `test/features/appointments/data/reschedule_contract_test.dart`
  parses the exact backend shape and drives hold → confirm → reschedule →
  repeat-reschedule (422) through the real Dio chain against the mock. The
  backend side is covered by the updated e2e test (LR-022), which also checks
  the replacement keeps the same `payment_intent_id`. Not yet exercised on a
  device against a running backend.

### LR-022 — Stale backend e2e expectations

`doctor-dashboard.e2e-spec.ts` still expected (a) a patient reschedule to
return an unconfirmed hold (changed deliberately in `894cba6`) and (b) a
profile email change to succeed (`EMAIL_NOT_EDITABLE`, deliberately added in
`00878e1`). Both now assert the current rules, including the negative side:
an email change is 422 and leaves the row unchanged, and the replacement
appointment keeps the original payment intent.

---

## 3. PM decision register — appointment lifecycle

All five were approved on 2026-10-03 with the rules below, and implemented
in backend `7c5a55c` (local; see §5 on pushing) and Flutter `c35e5d9`.

| ID | Decision | Approved rule | Status | Evidence |
|---|---|---|---|---|
| PM-APPT-01 | Patient cancel/reschedule cutoff | Allowed only while `now < slot.start_at` (absolute instant); pre-start fee/refund behavior unchanged | Implemented | use-case + repository `WHERE`; unit boundary tests (−1 ms, =, +1 ms); integration: past appointment → 422, row unchanged |
| PM-APPT-02 | Visit already started | No cancel/reschedule by anyone once `IN_DOCTOR_ROOM` or `LEFT` (`APPOINTMENT_VISIT_IN_PROGRESS`); an expired visit gives `APPOINTMENT_VISIT_ENDED` | Implemented (adapted from `8642082`) | unit; integration incl. race via repository `WHERE`; e2e doctor cancel / assistant reschedule in room → 422 |
| PM-APPT-03 | Visit-status time window | "B+": `WAITING → IN_DOCTOR_ROOM` only on the slot's calendar day in the branch `iana_timezone`; `IN_DOCTOR_ROOM → LEFT` always (cross-midnight) | Implemented | domain tests: summer +03 / winter +02, 23:59 vs 00:00, local-day ≠ UTC-date, 23:30 → 00:15 LEFT, unknown zone fails closed; integration + e2e future-day → 422 |
| PM-APPT-04 | COMPLETED / NO_SHOW | `LEFT` ⇒ `COMPLETED` in the same write. `NO_SHOW` only for still-`CONFIRMED` unattended expired visits (verified: `TIME_EXPIRED` alone is ambiguous). No refund, charge or wallet mutation on `NO_SHOW` | Implemented; historical reconciliation script ready, **not run on shared data** | repository + integration tests (payment intent, refunds, wallet transactions unchanged); script dry-run/apply/idempotency on the disposable DB |
| PM-APPT-05 | Assistant authority | Branch-scoped (existing `clinic_staff_assignments`); visit status + reschedule allowed; provider cancellation doctor-only | Implemented | unit + e2e: assistant cancel 403, out-of-branch 404, in-branch reschedule 200; Flutter hides Cancel for assistants |

Open follow-ups, not new decisions: a future no-show fee/refund policy
(explicitly deferred by PM); and how operations closes a visit left
`IN_DOCTOR_ROOM` for days (the script only reports these).

### Current lifecycle

```
Slot:        OPEN ─hold─▶ HELD ─confirm─▶ BOOKED ─cancel/reschedule─▶ OPEN
Appointment: CONFIRMED ─cancel─────▶ CANCELLED     patient (before start) or doctor; WAITING only
             CONFIRMED ─reschedule─▶ RESCHEDULED   + new CONFIRMED on the same payment; patient
                                                   (before start), doctor or assistant; WAITING only
             CONFIRMED ─visit LEFT─▶ COMPLETED     same write as the visit transition
             CONFIRMED ─sweep──────▶ NO_SHOW       WAITING past slot end + grace; no money moves
Visit:       WAITING ─(appointment's local day)─▶ IN_DOCTOR_ROOM ─(any time)─▶ LEFT
             WAITING ─sweep─▶ TIME_EXPIRED       any ─cancel─▶ CANCELLED
```

## 4. V1 feature readiness matrix (initial)

Evidence is limited to what §1 lists. Rows marked `UNVERIFIED` have not
been reviewed in this plan yet; they are not implied green.

| Feature | Actor | Backend | Flutter | Authz | Tests | Integration | Launch state | Blocker / next step |
|---|---|---|---|---|---|---|---|---|
| OTP login, refresh, logout | all | implemented | wired; refresh fixed (LR-010) | public + refresh-token | unit; device-session race integration green | no real SMS | **BLOCKED** | SMS provider (File 10 Part 4); production fails closed by design |
| Provider discovery / doctor profile | patient | implemented | wired | public | doctor-search integration green | UNVERIFIED vs real API | NEEDS HARDENING | contract parity (Phase 4) |
| Available slots | patient | implemented | wired; DST fixed (LR-008) | public | slot repository integration + 9 Flutter tz tests | UNVERIFIED vs real API | NEEDS HARDENING | LR-015, LR-018 |
| Booking (hold + confirm) | patient | implemented | wired | patient | hold/confirm concurrency integration green | UNVERIFIED end to end | NEEDS HARDENING | payment path gates (§5) |
| Cancellation | patient / doctor | implemented with approved rules | wired; hides after start / once started / for assistants | patient own; doctor own affiliations; assistant 403 | unit + integration + e2e | not on device | NEEDS HARDENING | device smoke; payment-provider refund path (§5) |
| Rescheduling | patient / doctor / assistant | implemented (one step, payment carried over) with approved rules | wired; contract fixed (LR-021) | scoped; assistant to assigned branches | unit + integration + e2e | not on device | NEEDS HARDENING | device smoke; LR-015 (booking into a past slot) |
| Visit status + COMPLETED/NO_SHOW | doctor / assistant | implemented with approved rules | wired; day window, NO_SHOW/TIME_EXPIRED labels | scoped | unit + integration + e2e | not on device | NEEDS HARDENING | run reconciliation per environment (authorization needed); device smoke |
| Appointment lists / detail | patient / doctor | implemented | wired | scoped | integration (patient list) | UNVERIFIED | NEEDS HARDENING | LR-018 |
| Wallet balance / history | patient | implemented | wired | patient | wallet concurrency integration green | UNVERIFIED | NEEDS HARDENING | contract parity |
| Wallet top-up (Paymob) | patient | implemented | wired, external checkout | patient | unit | no live gateway | **BLOCKED** | Paymob production credentials + live webhook (DEC-001) |
| Wallet transfer / refund request / linked cards / pay bills | patient | none | UI behind `isMock`, `Navigator`-only, release builds refuse the mock URL | — | — | — | **FUTURE** (FEATURE FLAGGED in UI) | backend contract when scheduled; keep UI, no production calls |
| Prescriptions (patient upload) | patient | implemented | wired | patient | drug-code trigger integration green | UNVERIFIED | NEEDS HARDENING | upload/media review (Phase 3) |
| Provider clinical requests | doctor / assistant | implemented | wired | scoped | unit + e2e spec (§1.1) | UNVERIFIED | NEEDS HARDENING | Part 51.10 gates |
| Pharmacy fulfilment | pharmacy staff (dashboard) | implemented | order creation only | branch-scoped | workflow + broadcast integration green | dashboard UNVERIFIED | NEEDS HARDENING | dashboard verification |
| Laboratory (referral orders) | patient / lab staff | implemented | partial | — | UNVERIFIED | patient lab-order 400 reported, not reproduced | UNVERIFIED | reproduce the 400 (Phase 4) |
| Notifications | all | implemented, PUSH only | wired | recipient-scoped | dispatch unit + reliability integration green | FCM not verified | **BLOCKED** | FCM credentials; LR-016 |
| Outbox / worker | system | implemented | — | — | unit + integration green | not deployed here | NEEDS HARDENING | Phase 7 ops (restart, health) |
| Audit | system | implemented | — | — | via use-case tests | — | UNVERIFIED | — |
| Media upload (ImageKit) | patient / provider | implemented | wired | UNVERIFIED | UNVERIFIED | no credentials | UNVERIFIED | Phase 3 upload review |
| Android release | — | — | signing config present | — | — | no signed build | **BLOCKED** | signed release build + device smoke |
| iOS release | — | — | — | — | — | no macOS toolchain | **BLOCKED** | external verification |

---

## 5. External release gates

None of these can be closed from mocks.

- Repository access: the Claude GitHub App cannot push to `eslambashry/clinic-reservations` (HTTP 403), so backend commits on the working branch exist only as an exported `git am` patch until access is granted. The Flutter branch is pushed.
- SMS/OTP provider: not selected (`LoggingOtpSender` only; production fails closed).
- FCM/APNs: `FIREBASE_PROJECT_ID` path unverified in a real project.
- Paymob: production credentials, live HMAC webhook, refund path.
- ImageKit: production keys, private-file access review.
- Database: backup **and restore** rehearsal, migration rehearsal, rollback procedure.
- Mobile: Android signed release build + device smoke; iOS signing/build on macOS.

---

## 6. Next steps (in plan order)

1. ~~PM-APPT-01…05~~ approved and implemented (§3). Remaining: authorize
   the reconciliation script per environment.
2. Phase 3 security review: upload/media, clinical-request cross-patient and
   cross-provider negatives, payments webhook replay/late webhook on the
   disposable stack. Reproduce LR-015.
3. Phase 4 contract parity, starting with the patient lab-order 400.
4. Phase 5 documentation reset (LR-019) once the decisions above land.
5. Phases 6–7: rendered UI on a device/emulator, ops rehearsal (§5).
