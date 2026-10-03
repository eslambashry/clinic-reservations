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
| Flutter `flutter analyze` | 0 errors, 0 warnings, 104 info |
| Flutter `flutter test` | 486 passed, 1 failed (`detail_screens_test.dart`: "a future appointment explains that visit controls are not ready") |

### After this batch

| Check | Environment | Result |
|---|---|---|
| Backend `npm test` (unit only now) | no database | 160 suites / 952 tests pass |
| Backend `npm run test:integration` | disposable local Postgres 16 + PostGIS 3.4 (port 55432) and Redis (port 56379), `prisma migrate deploy` (48 migrations) + `npm run db:seed` | 9 suites / 47 tests pass, three consecutive runs, each with 30 forced handler-less PENDING outbox events |
| Backend `npm run lint` / `build` | — | unchanged: 1 warning / pass |
| Flutter `flutter test` | — | all pass (adds 9 timezone, 11 transport and 2 reschedule-contract tests) |
| Flutter `flutter analyze` | — | 104 info, no new findings |
| Backend `npm run test:e2e` | same disposable DB | 5 suites / 110 tests pass (§1.1) |

Mutation checks: reverting the outbox SKIPPED/fencing behavior fails 3 and 2
outbox tests respectively; restoring the old Flutter `AuthInterceptor` fails
the concurrent-401 and replay-5xx tests; the timezone tests fail 5/9 against
the old fixed-offset code.

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
| LR-007 | Flutter provider dashboard | stale test | P2 | Fixed (policy open, PM-APPT-03) |
| LR-008 | Flutter booking | defect (timezone) | P1 | Fixed |
| LR-009 | Flutter transport | defect (retry) | P2 | Fixed |
| LR-010 | Flutter transport | defect (auth/session) | P1 | Fixed |
| LR-011 | appointments | product decision / financial | **P0** | **PM DECISION REQUIRED** (PM-APPT-01, -02) |
| LR-012 | appointments | product decision | P1 | **PM DECISION REQUIRED** (PM-APPT-04) |
| LR-013 | appointments / assistants | product decision / authz | P1 | **PM DECISION REQUIRED** (PM-APPT-05) |
| LR-014 | appointments visit status | product decision | P2 | **PM DECISION REQUIRED** (PM-APPT-03) |
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
- **Status**: the cutoff rule is a product decision → PM-APPT-01/02. Not
  implemented.

### LR-012 — Appointment status never reaches COMPLETED / NO_SHOW

`AppointmentStatus` has `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `NO_SHOW`,
but no runtime path sets them (only seed data). Visit progress lives in
`visit_status`; `ExpireWaitingVisitsUseCase` moves overdue `WAITING` visits to
`TIME_EXPIRED` but leaves `status` at `CONFIRMED`. Pharmacy order creation
and fulfilment accept `COMPLETED` appointments, so they are written for a
status nothing produces. → PM-APPT-04.

### LR-013 — Assistant (CLINIC_STAFF) authority is broader than documented

`ResolveAppointmentScopeUseCase` returns a `CLINIC_STAFF` scope over the
provisioning doctor's affiliations, and `/v1/doctors/me/appointments/*`
allows `DOCTOR` and `CLINIC_STAFF`. An assistant can therefore cancel
(always as `PROVIDER_REQUEST`, full refund), reschedule and advance visit
status on their own. The use-case doc comments still say CLINIC_STAFF is
"deferred". → PM-APPT-05.

### LR-014 — Visit status has no time window

Either side can mark a next-month appointment `WAITING → IN_DOCTOR_ROOM`
today. → PM-APPT-03.

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

### Current lifecycle (from source, `staging` @ `894cba6`)

```
Slot:        OPEN ──hold──▶ HELD ──confirm──▶ BOOKED ──cancel/reschedule──▶ OPEN
Hold:        ACTIVE ──confirm──▶ CONVERTED   ACTIVE ──TTL (5 min; Fawry 15, wallet 10)──▶ EXPIRED
Appointment: CONFIRMED ──cancel──▶ CANCELLED        (patient, doctor, assistant)
             CONFIRMED ──reschedule──▶ RESCHEDULED  + new CONFIRMED appointment, same payment
             CONFIRMED forever otherwise (COMPLETED / NO_SHOW / CHECKED_IN / IN_PROGRESS never set)
Visit:       WAITING ──▶ IN_DOCTOR_ROOM ──▶ LEFT   (doctor or assistant, strict order, no time window)
             WAITING ──slot end + APPOINTMENT_END_GRACE_MINUTES (worker, every 5 min)──▶ TIME_EXPIRED
             any ──cancel──▶ CANCELLED
```

| Action | Who | State required | Time limit | Money | Audit / notify |
|---|---|---|---|---|---|
| Hold + confirm | patient; staff walk-in via `/branch/:id/create` | slot `OPEN` | none checked (LR-015) | capture at confirm (pay-at-clinic ledger / wallet / online) | audited; `AppointmentConfirmed` + doctor/assistant events |
| Cancel | patient (reason `PATIENT_REQUEST`), doctor or assistant (must be `PROVIDER_REQUEST`) | `CONFIRMED` | **none** | patient: `CANCELLATION_TIER` fee (seed 10%); provider: full refund | audited; patient + doctor/assistant events |
| Reschedule | patient, doctor, assistant | `CONFIRMED`; same affiliation | **none** | payment carried over, no new charge | audited; events |
| Visit status | doctor, assistant | `CONFIRMED`, next in order | **none** | none | audited (`<from>_TO_<to>`) |
| Stale version / races | all | optimistic `version` + `WHERE status=…` guards; partial unique index on active holds | — | — | conflicts → 409 |

Concurrency is sound and covered by integration tests (one winner of N holds,
one winner of N confirms). The gaps are rule gaps, not race gaps.

### PM-APPT-01 — Patient cancellation and reschedule cutoff

**Current behavior**: none; a patient can cancel or reschedule any `CONFIRMED`
appointment at any time, including after it happened (LR-011, reproduced).

**Problem**: refunds for attended visits; free repeat visits via reschedule;
no-shows can recover their money; doctors lose slots minutes before start.

**Actors**: patient, doctor, assistant, operations/finance.

- **Option A: lock at scheduled start.** Patient may cancel/reschedule until
  `slot.start_at`; after that, only provider/admin paths. Simple, closes
  the past-appointment hole, still allows last-minute changes.
- **Option B: lock N hours before start** (configurable `policy_configs`
  value per region). Protects doctor schedules too; needs N chosen and
  shown in the UI.
- **Option C: tiered fee by lead time** (e.g. free > 24 h, fee inside), lock
  at start. Most flexible, most to explain and test; extends the existing
  `CANCELLATION_TIER` shape.

**Recommended**: A now, enforced server-side in both use-cases and the
repository `WHERE` (start time compared to `now()` in the DB), with B/C as
a follow-up once operations data exists. A closes the P0 with no new
business number to invent.

**Impact**: backend: one guard + `422 APPOINTMENT_CHANGE_WINDOW_CLOSED` in
cancel and reschedule (patient scope), Arabic catalog entry, unit and
integration tests (past appointment, in-progress, boundary second). Flutter:
`isCancellable` / reschedule entry also check `startAt > now`. No migration
for A; B/C add a `policy_configs` row. No payment logic change.

**Decision requested**: approve A (or choose B/C and the value of N / tiers).

### PM-APPT-02 — Changes once the visit has started (IN_DOCTOR_ROOM / LEFT)

**Current behavior**: patient, doctor and assistant can all cancel or
reschedule an appointment whose visit is `IN_DOCTOR_ROOM` or `LEFT`.

**Options**:
- **A: lock for everyone once `IN_DOCTOR_ROOM`.** Exactly what the unmerged
  `feat/lock-appointment-changes-after-visit-start` (`8642082`) implements
  (`422 APPOINTMENT_VISIT_IN_PROGRESS`). Corrections go through an admin
  path that does not exist yet.
- **B: lock for patients; providers may still cancel with a mandatory
  reason** (e.g. emergency). Keeps flexibility, needs a reason code and
  audit, and refund rules for a visit that started.

**Recommended**: A, by merging the existing branch after review and
re-running the integration suite. LEFT is terminal for booking changes;
corrections become an admin/finance operation.

**Impact**: backend: already implemented on the branch (use-cases,
repository `WHERE`, tests, catalog). Flutter: hide cancel/reschedule
unless `WAITING` on the provider side too (patient side already does).

**Decision requested**: approve A and merge the branch, or choose B.

### PM-APPT-03 — Visit-status time window

**Current behavior**: no window on either side (client window removed in
`9bd5f7c` for early arrivals and late finishes).

**Options**:
- **A: no window** (status quo). Maximum flexibility; a mistaken tap on a
  future appointment changes it.
- **B: appointment day only, in the branch's IANA zone** (server-side).
  Covers early arrival and overruns the same day; blocks future/past days.
- **C: configurable window around `start_at`.** Precise, but needs numbers.

**Recommended**: B. It matches clinic reality without inventing minute
values, and uses the branch timezone the schema already stores.

**Impact**: backend: day comparison in the branch zone in
`UpdateAppointmentVisitStatusUseCase`, plus a new 422 code. Flutter:
re-use the kept `available_near_time` / `outside_window` strings, and
`ianaLocation` for the day check. Tests: before/after midnight in summer and
winter.

**Decision requested**: A, B or C.

### PM-APPT-04 — Terminal appointment states (COMPLETED / NO_SHOW)

**Current behavior**: appointments stay `CONFIRMED` forever; `visit_status`
carries progress; `TIME_EXPIRED` is visit-level only.

**Options**:
- **A: derive.** `LEFT` ⇒ `status COMPLETED`, `TIME_EXPIRED` ⇒ `NO_SHOW`, in
  the same transaction / worker job. Makes PM-APPT-01/02 trivially
  enforceable by status and fixes pharmacy's `COMPLETED` checks.
- **B: keep `visit_status` as the only source** and remove the unused enum
  values from use (document `CONFIRMED` + `LEFT` as "done").

**Recommended**: A. No-show then needs its own follow-up rule (refund? fee?),
which is a separate decision; until then, NO_SHOW changes no money.

**Impact**: backend: two writes added to existing paths, reconciliation of
existing rows by a reviewed data migration (not run against live data
without approval), list/filter DTOs. Flutter: status labels.

**Decision requested**: A or B; and, separately, the no-show money rule.

### PM-APPT-05 — Assistant (CLINIC_STAFF) authority

**Current behavior**: assistants can independently cancel (full refund),
reschedule and change visit status for all of their doctor's branches
(LR-013).

**Options**:
- **A: assistants may do visit status and reschedule; cancellation needs
  the doctor.** (Draft + approve, mirroring clinical requests.)
- **B: assistants have full appointment authority** (current code), audited
  under their own membership.
- **C: assistants limited to the branch they are assigned to**, otherwise as B.

**Recommended**: C+A: branch-scoped, with cancellation reserved to the
doctor. Cancellation moves money; reschedule and visit flow are the daily
operational work assistants exist for.

**Impact**: backend: scope narrowed to assigned branches, role check on the
cancel route; Flutter: assistant UI hides cancel. Tests: assistant negative
paths.

**Decision requested**: A, B or C (or a combination).

---

## 4. V1 feature readiness matrix (initial)

Evidence is limited to what §1 lists. Rows marked `UNVERIFIED` have not
been reviewed in this plan yet; they are not implied green.

| Feature | Actor | Backend | Flutter | Authz | Tests | Integration | Launch state | Blocker / next step |
|---|---|---|---|---|---|---|---|---|
| OTP login, refresh, logout | all | implemented | wired; refresh fixed (LR-010) | public + refresh-token | unit; device-session race integration green | no real SMS | **BLOCKED** | SMS provider (File 10 Part 4); production fails closed by design |
| Provider discovery / doctor profile | patient | implemented | wired | public | doctor-search integration green | UNVERIFIED vs real API | NEEDS HARDENING | contract parity (Phase 4) |
| Available slots | patient | implemented | wired; DST fixed (LR-008) | public | slot repository integration + 9 Flutter tz tests | UNVERIFIED vs real API | NEEDS HARDENING | LR-015, LR-018 |
| Booking (hold + confirm) | patient | implemented | wired | patient | hold/confirm concurrency integration green | UNVERIFIED end to end | NEEDS HARDENING | payment path gates (§5) |
| Cancellation | patient / doctor / assistant | implemented | wired | scoped, rule gaps | integration green | — | **PM DECISION REQUIRED** | PM-APPT-01, -02, -05 (P0) |
| Rescheduling | patient / doctor / assistant | implemented (one step, payment carried over) | wired; contract fixed (LR-021) | scoped, rule gaps | integration + e2e green | not on device | **PM DECISION REQUIRED** | PM-APPT-01, -02, -05 (P0) |
| Visit status | doctor / assistant | implemented | wired | scoped | unit | — | **PM DECISION REQUIRED** | PM-APPT-03, -04 |
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

- SMS/OTP provider: not selected (`LoggingOtpSender` only; production fails closed).
- FCM/APNs: `FIREBASE_PROJECT_ID` path unverified in a real project.
- Paymob: production credentials, live HMAC webhook, refund path.
- ImageKit: production keys, private-file access review.
- Database: backup **and restore** rehearsal, migration rehearsal, rollback procedure.
- Mobile: Android signed release build + device smoke; iOS signing/build on macOS.

---

## 6. Next steps (in plan order)

1. **PM**: decide PM-APPT-01…05 (P0 blocks release). After approval:
   implement, merge/adapt `feat/lock-appointment-changes-after-visit-start`,
   re-run the integration suite.
2. Phase 3 security review: upload/media, clinical-request cross-patient and
   cross-provider negatives, payments webhook replay/late webhook on the
   disposable stack. Reproduce LR-015.
3. Phase 4 contract parity, starting with the patient lab-order 400.
4. Phase 5 documentation reset (LR-019) once the decisions above land.
5. Phases 6–7: rendered UI on a device/emulator, ops rehearsal (§5).
