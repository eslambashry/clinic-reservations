# MedSuper V1 Launch Readiness

The single canonical launch-readiness source for both `clinic-reservations`
(backend) and `med-super` (Flutter). It holds the evidence log, issue
register, PM decision register and V1 feature readiness matrix. Update it in
place; do not fork it into per-repo or per-date copies.

Plan: *MedSuper Backend and Flutter Launch-Readiness Master Plan* (started 2026-10-03).

**ملخص عربي — آخر تحقق محلي:** أُصلحت حدود حسابات الموظفين والوصفات،
ومنع تكرار طلب الصيدلية، وحدود رفع الملفات، وتبديل جلسات Flutter وحفظ
رموز الدخول، وتوقيت فرع الموعد واختيار فرع إعادة الجدولة وسجل الطلبات.
نجح 1194 اختبار وحدة و102 اختبار تكامل و114 اختبار HTTP للخلفية، و629
اختبار Flutter. تحليل Flutter: صفر أخطاء وصفر تحذيرات، مع 101 ملاحظة
معلوماتية؛ أمر التحليل يعيد exit 1 ولا يُعد بوابة نظيفة. نجح بناء Android
التجريبي على الشجرة الحالية في 2026-10-04؛ النسخة تستخدم بيانات وهمية.
الإطلاق ما زال يحتاج اختبارات
جهاز وخدمات دفع وإشعارات ورفع حقيقية، وتوقيع الإصدارات وتجربة استعادة
النسخ الاحتياطية. التغطية الأمنية جزئية، والمشروع غير معلن جاهزًا للإنتاج.

| | Backend `clinic-reservations` | Flutter `med-super` |
|---|---|---|
| Baseline ref | `staging` @ `894cba6` | `staging` @ `9537165` (the plan recorded `93ebe2e`, which is not on the remote; `staging` had moved) |
| Current working branch (2026-10-03 continuation) | `main` @ `315a02a` + focused working-tree fixes | `staging` @ `b5bbee7` + focused working-tree fixes |

Status words used below: `PRODUCTION READY`, `NEEDS HARDENING`,
`PM DECISION REQUIRED`, `FEATURE FLAGGED`, `FUTURE`, `BLOCKED`. `UNVERIFIED`
marks anything without evidence yet. "Implemented", "tested" and "verified"
are not the same thing and are not used interchangeably here.

---

## 1. Evidence log

The baseline and earlier batches below are historical cloud-container evidence
(Node 22.22, Flutter 3.47.4, Dio 5.11.0). They do not describe the current
Windows continuation environment or prove the current assembled checkout.

### Current Windows continuation (2026-10-03)

- Externally committed backend `31c7a90` retains managed-staff identity and
  suspension/issuance locking; `315a02a` retains branch-order prescription
  privacy. These commits were made by another task, not this continuation.
- Fresh retained-source boundary review found no surviving backend bypass in
  the reviewed identity/token and branch-order prescription boundaries. This
  is a scoped finding, not a claim that all possible bugs have been found.
- Multipart repair: actual Express/Multer/Busboy regressions failed 5/12
  before the patch, then passed 12/12. All four upload contracts remain valid;
  nine parts (four metadata fields + five files) pass and a tenth skipped
  attachment part fails. Shared caps: four fields, five files, 1 MiB per value,
  explicit field-name length 100. Existing document limit remains 15 MiB per
  file. Deployment memory/concurrency measurement remains a release gate.
- Parent postpatch multipart review found no surviving bypass or contract
  regression; independent delegation was unavailable at the thread limit,
  so the parent performed the separate final review fallback.
- Current build passes; lint has zero errors and one existing `_dropped`
  warning. Final full unit gate: 166 suites / 1194 tests pass
  (`backend-unit-assembled.log`). Real database gates use the explicitly isolated,
  seeded fixture `medsuper_order_race_20261003_01`: 14 integration suites /
  102 tests pass (`backend-integration-assembled.log`), including doctor-status
  locking, branch-order prescription guards, pharmacy creation/review races
  and the database-generated specialty UUID. Five HTTP E2E suites / 114 tests
  pass (`backend-e2e-assembled.log`), including patient appointment branch
  timezone and both 21-order pagination/other-patient isolation boundaries.
- LR-017 is repaired: schema default `dbgenerated("gen_random_uuid()")` and
  new forward migration `20261003180000_align_specialty_uuid_default`
  preserve the existing database-generated UUIDv4 contract. Prisma generation
  passes; all 48 migrations apply on the disposable fixture only. Fresh
  database-to-schema diff is empty, exit 0 (`backend-schema-parity-resolved.log`);
  the actual default integration regression is red-before / green-after.
- Flutter restoration, account-transition/cache fencing, branch timezone,
  exact reschedule affiliation and paged order history are verified in the
  current full gate: **629 tests pass** (`flutter-test-accessibility-final.log`).
  This includes two new detail polling callbacks; the first assembled run
  exposed both narrow status-row overflows, repaired with bounded flexible
  labels. Detail UI gate: eight tests pass (`flutter-detail-pagination-final.log`).
- LR-036 token-pair storage failure reproduced two failures with three valid
  controls before repair. A durable pending marker now suppresses incomplete
  credentials, including failed cleanup and simulated process restart;
  native-write generation changes cannot publish a stale pair. Focused
  storage/network/auth gate: **56 tests pass** (`flutter-storage-pair-green.log`).
- Current `flutter analyze`: **0 errors, 0 warnings, 101 informational
  notices**, exit 1 (`flutter-analyze-accessibility-final.log`). Existing style and
  test-import debt remains; this is not a clean analyzer gate. Two earlier
  ignored-result warnings were resolved by explicitly invalidating then
  awaiting detail-provider reads; the eight callback/UI cases still pass.
- Android: the JDK local-connection failure was resolved with a process-only
  short Unix-domain-socket directory. The subsequent actual debug attempt
  failed after SDK installation: AGP 9.0.1 could not resolve `android-37`
  (`flutter-apk-short-temp-final.log`). Installed package metadata is API37.0.
  LR-037 aligns AGP9.1.1 / Gradle9.3.1 and CI's SDK37.0 package with the
  existing compileSdk37, JDK17 and targetSdk36. Debug build succeeds, followed
  by a fresh final-tree `--no-pub` build:77.7s, exit0 on2026-10-04
  (`flutter-apk-final-tree.log`). Artifact:
  `med-super/build/app/outputs/flutter-apk/app-debug.apk`,185328990 bytes.
  SHA256:`B139A7290092D2C7E741D79DE092828C4D1C9A7C9BC9C386BB7E344B1BC6F5A8`.
  Packaged metadata:com.medsuper.med_super,1.0.0/code1,minSdk24,targetSdk36,
  compileSdk37;arm64-v8a/armeabi-v7a/x86_64. Default BASE_URL unset/mock,
  debug signing only. No device, live-backend or store acceptance is claimed.
  Build warns file_picker/package_info_plus still apply KGP; future Flutter
  upgrades need plugin compatibility review. No dependency was upgraded to
  suppress that warning.
- The earlier 795-item scope audit was partial coverage. Live provider,
  private media signing, payment/webhook, device and signed-release gates
  remain unverified. The project is not marked production ready.
- The managed backend baseline scan `0308c419-e5fb-4ca7-88c6-c4f425efd9f3`
  is now sealed successfully: six validated historical findings, four high
  and two medium, with explicitly partial83/795 source receipts. It targets
  immutable894cba6; HEAD moved externally during the scan. Current-source
  repairs and tests are recorded separately above. A completed report is
  not complete source coverage or deployed remediation.
- Fresh final backend build passes (`backend-build-verified-final.log`);
  lint passes with the same one existing warning (`backend-lint-verified-final.log`).

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

### Phase 3 security review (targeted, 2026-10-03)

| Area | Finding | Evidence |
|---|---|---|
| Medical files | Every PHI upload (patient/provider prescriptions, lab results, verification documents) is stored `isPrivate: true`; every PHI read re-signs with a 5-minute TTL; only doctor profile photos are public by design | source review of all `upload`/`getSignedUrl` call sites |
| Lab order reads | Owner, LAB_STAFF of that exact branch, or the originating doctor (assistant: own requests only); others 404 | source review; e2e provider clinical requests |
| Prescription reads | Historical finding: global pharmacy access; superseded by approved branch-order-only routes in `315a02a` | current source and approved PM-SEC-01 below |
| Payment webhook | HMAC-SHA512, `timingSafeEqual`, verified before anything is recorded; deduplicated by gateway transaction ID in the side-effect transaction; late/duplicate paths explicit | source review + existing unit tests; live Paymob field order is an external gate (§5) |
| Appointment authz | assistant cancel 403, out-of-branch 404, patient cutoffs | e2e + integration (this batch) |
| Auth / sessions | refresh rotation + theft revocation race covered by `device-session-race` integration; client single-flight refresh (LR-010) | integration + Flutter tests |

This earlier targeted review was incomplete. The continuation adds retained
identity/PHI-boundary review and real multipart negative tests above; live
media/provider behavior and deployment load remain separate gates.

### 1.1 E2E

`npm run test:e2e` on the same disposable stack: 5 suites / 110 tests pass
(doctor dashboard, provider assistants, provider clinical requests,
scheduling availability, provider directory). Baseline: 2 failures, both
stale expectations against deliberate rule changes (LR-022).

### Historical cloud run — not run / environment limits

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
| LR-015 | appointments booking | defect | P2 | Fixed (`11cf872`) |
| LR-016 | notifications safety-critical | release gate / product | P1 | Open |
| LR-017 | Prisma schema | contract drift | P3 | Repaired; fresh isolated database/schema diff empty, default regression green; shared migration not applied |
| LR-018 | Flutter appointment dates | defect / contract parity | P2 | Repaired for reviewed appointment surfaces; IANA/UTC controls and actual non-Cairo HTTP contract green; device verification open |
| LR-019 | docs | stale documentation | P3 | Open (Phase 5) |
| LR-020 | release | external gates | P1 | Open, see §5 |
| LR-021 | Flutter ↔ backend reschedule | contract mismatch | P1 | Fixed |
| LR-022 | backend e2e | stale test | P2 | Fixed |
| LR-023 | patient lab order (staging 400) | defect / data | P1 | Root cause found; code fix already on `staging`; **staging deploy + migration UNVERIFIED** |
| LR-024 | prescriptions (pharmacy staff reads) | security / privacy | P1 | Approved and implemented: branch-order-only (PM-SEC-01); live client/provider gate remains |
| LR-025 | admin PHI reads | security hardening | P2 | Open (no mandatory reason-code audit, File 12 Part 37.6) |
| LR-026 | managed staff identities | security / account takeover | P1 | Repaired in retained `31c7a90`; approved identity separation; real boundary regressions pass |
| LR-027 | suspended identity token issuance | security / session lifecycle | P1 | Repaired in retained `31c7a90`; locking/status/revocation boundaries pass; existing JWT expiry remains |
| LR-028 | prescription review / prescribing eligibility | security / clinical safety | P1 | Retained `315a02a` plus current guards; unit and 27 clinical DB boundary cases green; live clinical gate open |
| LR-029 | shared multipart uploads | security / resource exhaustion | P1 | Repaired locally; red 5 failures → real parser 12/12 green; capacity gate remains |
| LR-030 | active pharmacy order creation | correctness / concurrency | P1 | Repaired locally; real DB 7/7 green; one winner under six concurrent creates |
| LR-031 | Flutter session/cache transitions | security / race / merge loss | P1 | Repaired; 56 focused and 629 full Flutter cases pass; native/backend smoke remains |
| LR-032 | iOS photo permission purpose strings | platform / release defect | P1 | Purpose string + Arabic/English localization present; static verified; device/build pending |
| LR-033 | Flutter SMS/picker fixtures | stale regression coverage | P2 | Fixtures aligned; full 629-test Flutter gate passes; live SMS is still unavailable |
| LR-034 | Flutter patient order history | defect / pagination | P2 | Repaired; paging, list/detail polling and both 21-order HTTP isolation boundaries pass; full Flutter gate629 green |
| LR-035 | Patient reschedule clinic selection | defect / contract parity | P2 | Repaired; exact affiliation branch/zone, 3 red regressions then 4 positive/negative widget cases green; device gate open |
| LR-036 | Flutter secure token-pair storage | security / partial native write | P1 | Repaired; durable guard, cleanup/restart and native-write session races covered in 56 focused /629 full tests; device storage proof open |
| LR-037 | Android SDK37 build tool compatibility | build / release | P1 | Repaired; final-tree debug APK built/hash recorded on2026-10-04; mock/debug only, device/signing/live gates remain |
| LR-038 | Order detail at large text / narrow phone | accessibility / amount visibility | P2 | Repaired; four red AR/EN320px2x cases, twelve focused green including polling controls; full629 green |

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

### LR-015 — Patient bookings on a slot that has already started

- **Reproduced** (disposable DB): a patient held and confirmed a slot that
  started an hour earlier → `CONFIRMED`. Reachable from a slot list loaded
  just before the start time, or directly through the API. Such a booking
  could not then be cancelled by the patient (PM-APPT-01) and would be swept
  to `NO_SHOW`.
- **Repair** (`11cf872`): patient hold creation and the patient's reschedule
  target require `now < start_at` (`422 SLOT_ALREADY_STARTED`). This is the
  PM-APPT-01 boundary with **no lead time added**. Any minimum lead time
  above zero would be a new PM decision. Staff walk-ins and provider
  reschedules are unchanged.
- **Verification**: unit (at start, after start, patient reschedule target);
  full unit/integration/e2e green.

### LR-016 — SAFETY_CRITICAL lab result is push-only

`CriticalLabResult` is `SAFETY_CRITICAL` and PUSH-only. With no SMS provider
(File 10 Part 4 open decision) and FCM not yet verified in production, a
patient with no registered device gets only an inbox row. Needs either a
verified FCM path plus a stated fallback, or an explicit product acceptance.

### LR-017 — Schema drift on `specialties.code`

Migration `20260923140000_specialty_code_to_uuid` already set
`DEFAULT gen_random_uuid()` on `specialties.code`. Before this repair, source
declared Prisma's client-side `@default(uuid())`; the fresh isolated
database/schema diff exited 2 and proposed dropping the database default.
Source now declares `@default(dbgenerated("gen_random_uuid()"))` at
`prisma/schema/provider-directory.prisma:5`. New forward migration
`20261003180000_align_specialty_uuid_default` preserves that existing UUIDv4
default; historical migrations and existing specialty codes/references are
unchanged. Prisma generation and 14 focused specialty unit tests pass.

All 48 migrations were applied only to the disposable fixture
`medsuper_order_race_20261003_01`. Fresh database-to-schema diff is empty,
exit 0 (`backend-schema-parity-resolved.log`). The actual Prisma integration
test fails before and passes after the repair: INSERT omits `code`, the
database default exists, and returned/read-back codes are UUIDv4. Source and
local schema parity repaired; shared/live migration remains unapplied.

### LR-018 — Appointment times rendered in the device zone

Patient appointment detail/reschedule, the pharmacy clinic-handover selector
and provider appointment/calendar day filters used device-local timestamps.
The reproduced current defect is wrong displayed time/day on a device in
another zone; the older fixed-Cairo-offset defect belongs to LR-008, not a
second current formatter finding.

Patient list/detail HTTP responses now carry the owning branch's
`ianaTimezone`; Flutter preserves source UTC instants and formats these
appointment surfaces and provider day filters using the existing IANA helper.
Missing/invalid zones explicitly display UTC rather than choosing a device
or invented Cairo zone. An actual non-Cairo patient list/detail HTTP case is
included in the current 114-test E2E gate. The focused appointment/timezone
gate passes 35 cases, expanded to 36 with LR-035; Cairo DST, day boundaries,
non-Cairo branches and missing/invalid zone controls are covered. Ordinary
order creation timestamps are outside this appointment-zone repair. Local
contract/display repair verified; actual device rendering remains open.

### LR-019 — Stale documentation (Phase 5)

- Historical audit observations included an obsolete Phase 3 cap and mock-only
  provider description in `med-super/CLAUDE.md`, plus stale assistant-scope
  comments (LR-013). The current Flutter guide now identifies shipped features
  and labels the parity matrix as an older snapshot at its top; those original
  statements must not be reported as unchanged current facts.
- The Flutter architecture paragraph still calls that older parity matrix
  "current-state truth", contradicting its current-source guidance. Broader
  guide/phase/status consistency remains to be reviewed in the reset.
- `clinic-reservations/CLAUDE.md` "Project state" describes phases that later
  sections and the code have moved past.
- This continuation corrected the class comments in `GetPrescriptionUseCase`
  and `PrescriptionsController`: global detail is patient-own/admin; pharmacy
  reads/reviews go through authorized branch-order routes. This is a comment
  correction only, not closure of the broader documentation reset.

### LR-020 — External release gates

See §5.

### LR-023 — Patient lab order `400 VALIDATION_ERROR` on staging

- **Root cause**: early demo seed rows used UUID-shaped IDs without
  version/variant bits (e.g. lab branch `00000000-0000-0000-0000-000000000211`).
  Postgres stores them, branch search returns them, and the app sends them
  back, but `@IsUUID()` (validator 13.15.35) rejects them, so `POST
  /v1/lab-orders` returns `400 VALIDATION_ERROR` "فرع المعمل غير صالح." This
  matches the 2026-09-30 staging logs (body not logged).
- **Reproduced** through the real API on the disposable DB: the legacy-shaped
  branch ID → 400 with that field message; the same request with the
  re-keyed ID → `REQUESTED`.
- **Fix already on `staging`** (2026-10-01): `fe4a7c9` (valid UUIDv4 seed IDs),
  `72ef6d4` (migration `20261001090000_rekey_legacy_demo_uuids`), `ba73af8`
  (seed refuses databases that still hold legacy IDs). Verified here on a
  database built from the migrations *before* the re-key, with legacy rows:
  branch, laboratory, address, LAB_STAFF `role_memberships.context_id`
  (no FK), staff assignment and a lab order were all re-keyed, with no
  orphans; a second run is a no-op. The same class of bug affected the other
  legacy demo IDs (pharmacy branches, doctors, patients), which the same
  migration covers.
- **Not verified**: that the staging environment has deployed `staging` and
  applied the migration, and a real device order after that. Needs staging
  access → release gate.

### LR-024 — Historical global pharmacy access; repaired (PM-SEC-01)

`GET /v1/prescriptions` (review queue) and `GET /v1/prescriptions/:id` let
every `PHARMACY_STAFF` user see every patient's quality-checked prescription,
with freshly signed image URLs; `:id` is not even limited to the queue's
status. File 12 Part 37.4 chose this open queue on purpose for Phase 6 and
said to "tighten once Phase 7 introduces real routing". Phase 7 shipped
and the tightening never happened. Changing it decides who may see patient
prescriptions. This is historical behavior, superseded by the user's approved
branch-order-only policy and externally committed backend `315a02a`.
Staff now read/review through `GET /v1/pharmacy-orders/:id/prescription` and
`POST /v1/pharmacy-orders/:id/prescription/review`, after the owning module's
branch/order authorization. Global staff queue/read/review routes are removed.
Patient ownership and current clinical eligibility remain enforced. See §3.

### LR-025 — Admin PHI reads are not reason-coded

File 11 07.2 / File 12 Part 37.6: admin PHI reads must be audit-logged with
a mandatory reason code. No such audit variant exists; `ADMIN` can read a
prescription with no audit row at all. Part 37.6 explicitly records this
primitive gap and deferred it rather than inventing a one-off mechanism.
Reason selection, the existing audit service contract and the admin read API
need a focused contract review before implementation. This remains an open
hardening item after approved PM-SEC-01; no runtime policy changed here.

### LR-026 — Owner-managed staff takeover and identity separation (P1)

- **Impact/root cause:** provisioning an unrelated OTP-only patient's phone
  could reset the global user password and return it to the doctor; owner
  staff PATCH and later membership grants could also mix employee credentials
  with personal or another owner's access. Active-only ownership checks missed
  revoked history. Sources: `src/modules/identity-auth/application/provision-staff-user.use-case.ts`,
  `update-staff-membership.use-case.ts`, `infrastructure/role-membership.repository.ts`.
- **Repair:** retained `31c7a90` applies the approved separate employee policy
  through `domain/staff-identity.rules.ts`, all-history ownership guards and
  the shared per-user auth lock. Empty/unrelated/mixed identities reject before
  global writes; later personal or other-owner grants reject. Legacy conflicts
  require explicit account/credential/session remediation.
- **Evidence/status:** historical reproduction had 13 failures in 14 boundary
  cases; retained repairs preserve new staff, exact-owner revoked reactivation
  and personal PATIENT + DOCTOR while rejecting patient takeover/mixed history.
  Parent confirms 13 real identity DB tests included in the final 102-test integration
  run (five identity-boundary + eight device/session-race cases). Sources:
  `infrastructure/identity-boundary.spec.ts`, `identity-boundary.integration.spec.ts`
  and `device-session-race.integration.spec.ts` in identity-auth. Source repair verified;
  no live legacy remediation performed.

### LR-027 — Suspended identities could receive fresh tokens (P1)

- **Impact/root cause:** OTP/refresh/switch callers reached TokenService without
  a central current-user ACTIVE check serialized with suspension, allowing a
  disabled identity to mint/rotate credentials. Source:
  `src/modules/identity-auth/infrastructure/token.service.ts`.
- **Repair:** retained `31c7a90` locks the user and rechecks active/non-deleted
  status and membership before JWT/refresh writes. `user.repository.ts`
  suspension takes the same lock and revokes refresh tokens/devices atomically.
- **Evidence/status:** real TokenService rejects suspended issuance/rotation;
  active identities still succeed. Real DB forced both orderings: issuance first
  is revoked before suspension returns; suspension first prevents issuance.
  `identity-boundary.integration.spec.ts` covers these boundaries. Existing
  access JWTs retain configured TTL; immediate global JWT invalidation is not
  claimed. Source/session persistence boundary verified, live legacy operations pending.

### LR-028 — Pharmacy review bypassed doctor signoff / eligibility (P1)

- **Impact/root cause:** pharmacy review could advance an assistant's pending
  doctor approval to an accepted prescription; provider issuance/signing lacked
  a shared current verified-doctor eligibility guard. Branch privacy alone did
  not establish clinical readiness. Sources:
  `src/modules/prescriptions/application/review-prescription.use-case.ts`,
  `domain/prescription-review.rules.ts`, provider create/upload/approve use-cases.
- **Repair:** retained `315a02a` and current clinical guards reject non-reviewable
  source/document/status combinations, preserve doctor approval, and use
  `src/modules/provider-directory/application/assert-doctor-prescribing-eligibility.use-case.ts`
  for verified/non-deleted doctors. Prescription review/order writes and doctor
  status eligibility checks use transaction row locks.
- **Evidence/status:** unit negatives cover pending signoff, invalid clinical
  document/state and pending/suspended/deleted doctors; legitimate approved
  prescriptions and verified doctors remain supported. Real isolated-DB
  `doctor-prescribing-eligibility.integration.spec.ts` passes eight cases,
  including both forced suspension/signing lock orderings.
  `order-prescription-access.integration.spec.ts` passes 19 cases covering
  owning branch access, unanswered eligible broadcast, declined/timed-out
  broadcasts, claims by another branch and stale/revoked membership. All 27
  cases are included in the final 102-test integration gate. Local boundary
  repair verified; no live clinical claim.

### LR-029 — Multipart metadata/part totals were unbounded (P1)

- **Impact/root cause:** `src/shared/kernel/storage/multer.config.ts` bounded
  each file only; arbitrarily repeated fields and skipped parts could consume
  aggregate parser work/body memory. Installed multipart field-name enforcement
  also needed explicit configuration.
- **Repair:** shared caps now limit fields to four, files to five, values to
  the existing 1 MiB and field-name length to 100. Busboy's threshold of ten
  permits nine actual parts and rejects the tenth; stricter route/file caps stay.
- **Evidence/status:** `multer.config.spec.ts` uses actual Express/Multer HTTP
  parsing: red 5 failed/7 passed → green 12/12. All four valid upload DTOs pass;
  repeated/excess/oversized fields, long names, excess files and skipped parts
  reject before application handling. Parent separate review found no surviving
  bypass. Local repair verified; concurrent 5×15 MiB file capacity and real
  ImageKit/private signing remain release gates.

### LR-030 — Concurrent pharmacy creates and hidden older active orders (P1)

- **Impact/root cause:** an unlocked accepted-prescription check and
  newest-order-only lookup let six competing requests create six active
  fulfillment orders. A newer terminal order also hid an older active order.
  Sources: `src/modules/pharmacy-fulfillment/application/create-pharmacy-order.use-case.ts`,
  `infrastructure/pharmacy-order.repository.ts`, `domain/pharmacy-order.rules.ts`.
- **Repair:** shared prescription row lock serializes creation with review;
  lookup filters all nonterminal orders instead of inspecting only the newest.
  Terminal REJECTED/FULFILLED orders still permit legitimate reorders.
- **Evidence/status:** real isolated-DB regression
  `infrastructure/pharmacy-order-creation-concurrency.integration.spec.ts`:
  before six creates succeeded; after exactly one succeeds and five conflict.
  Every older active state remains blocking behind a newer terminal row; both
  terminal reorder positives pass. Patient, doctor, assistant and mixed
  concurrent requests are covered, with persisted item/broadcast/audit/outbox
  single-winner assertions. Expanded cases are green in the final 102-test
  integration run. Local repair verified; deployed parity remains pending.

### LR-031 — Flutter lost session fixes and late OTP/logout races (P1)

- **Impact/root cause:** merge loss dropped previously implemented session
  fencing; late refresh/OTP/login responses could restore an older session,
  expose stale clinical cache or clear a newer login. Sources in `med-super`:
  `lib/core/network/interceptors/auth_interceptor.dart`,
  `lib/core/storage/secure_storage_service.dart`,
  `lib/features/auth/data/repositories/auth_repository_impl.dart`.
- **Repair:** current staging restoration plus generation-fenced request,
  refresh and session transitions, conditional credential writes/clears, cache
  invalidation and logout completion fencing. Preserve single-flight refresh,
  same idempotency key on replay and non-auth refresh-failure session retention.
- **Evidence/status:** `test/core/storage/secure_storage_session_test.dart`,
  `test/features/auth/data/auth_session_transition_test.dart` and
  `test/features/auth/session_clinical_cache_test.dart` cover late responses,
  logout/account-switch negatives and legitimate fresh login. Current focused
  gate56 and full Flutter gate629 pass; device/backend smoke remains open.

### LR-032 — iOS photo permission purpose string/localization (P1)

- **Impact/root cause:** missing photo-library purpose text could prevent the
  supported prescription/referral gallery journey on iOS. Static source now
  contains `NSPhotoLibraryUsageDescription` in `med-super/ios/Runner/Info.plist`.
- **Repair/evidence:** `ios/Runner/ar.lproj/InfoPlist.strings` and
  `en.lproj/InfoPlist.strings` contain photo/camera/location purpose text in both
  languages. Static files verified. Legitimate gallery/camera and denied
  permission behavior still require a signed iOS build/device run; not closed
  as a platform release gate.

### LR-033 — Flutter stale SMS and picker regression fixtures (P2)

- **Impact/root cause:** notification DTO fixtures assumed an unsupported SMS
  channel and the upload widget fixture no longer modeled the current image
  picker callback/platform error path. These were test-contract drift rather
  than evidence that production SMS had been implemented.
- **Repair/evidence:** `med-super/test/features/notifications/data/models/notification_preference_dto_test.dart`
  now rejects unsupported SMS while preserving PUSH mapping;
  `test/features/pharmacy_booking/presentation/screens/pharmacy_prescription_upload_screen_test.dart`
  uses the real picker method channel and expects the localized recoverable
  error. Included in the passing full629-test gate. No provider behavior changed to
  satisfy these fixtures.

### LR-034 — Patient lab/pharmacy history stops at the first 20 orders (P2)

- **Impact/root cause:** backend list contracts expose `orders` plus
  `nextCursor`, with default limit 20. Flutter patient adapters discard
  `nextCursor`, and the orders tabs cannot request older rows; searching a
  known older order locally can therefore show an empty result.
- **Source evidence:** `med-super/lib/features/lab_booking/data/datasources/remote/lab_order_remote_datasource.dart:37`,
  `pharmacy_booking/data/datasources/remote/pharmacy_order_remote_datasource.dart:46`,
  and both list providers; `home/presentation/screens/orders_placeholder_screen.dart`
  only renders/filter these lists. Backend `ListLabOrdersUseCase` and
  `ListPharmacyOrdersUseCase` return cursors. Mock lists always return
  `nextCursor: null`, hiding the truncation from ordinary mock journeys.
- **Focused repair:** preserve one-page responses and add explicit
  bounded load-more state/actions, following existing plain Riverpod patterns.
  Provider names and existing session invalidations stay. Duplicate IDs,
  repeated taps, page retry and stale-request/account fences are covered.
  Periodic polling refreshes only the pages already requested, publishing
  together; manual pull refresh deliberately restarts the first page. Poll
  failure cannot erase history or leak an unhandled error from a queued tap.
  No unbounded history auto-fetch. Order-card status labels also have bounded
  flex width after the new 400px widget cases exposed overflowing rows.
- **Verification/status:** both actual HTTP boundaries are green: 21 own
  orders produce 20 rows plus cursor, then one row plus null cursor; another
  actor cannot read those orders by replaying the cursor or detail ID.
  Included in the assembled 114-test E2E gate. Focused Flutter gate passes
  46 cases (`flutter-pagination-final.log`): 22 paging/polling/actual-Dio cases,
  six localized UI/search/retry/poll callback cases and 18 existing provider/
  auth-cache cases. The original periodic reset callbacks fail both direct
  callback regressions (`flutter-pagination-poll-red.log`); repaired callbacks
  pass. Detail-screen polls now await detail refresh and preserve requested
  list pages; their two callback regressions exposed narrow status-row
  overflow, repaired with flexible full labels. Eight UI cases pass and the
  full assembled Flutter gate629 is green; device gates remain separate.
  This focused parity spotcheck found no additional verified
  P1 create/upload/detail field, enum, nullable or money-shape mismatch; it
  does not close the broader Phase 4 audit.

### LR-035 — Patient reschedule used the doctor's primary clinic (P2)

- **Impact/root cause:** the slot query used the public profile's primary
  branch even when the existing appointment belonged to another affiliation,
  offering incompatible replacement slots and a backend 409. Source:
  `med-super/lib/features/appointments/presentation/screens/reschedule_screen.dart`.
- **Repair:** resolve `doctorClinicAffiliationId` against the public profile's
  actual `affiliations`; use that exact branch and zone. Missing, ambiguous
  or unusable identity fails closed with the existing unavailable UI and
  disabled submission. No primary-clinic or mock `availableDays` fallback.
  Existing server same-affiliation rule and API are unchanged.
- **Evidence/status:** `reschedule_branch_test.dart` shows three regressions
  fail before plus one primary-branch control pass, then all four pass
  (`flutter-reschedule-branch-red.log` / `-green.log`). Expanded appointment
  gate passes 36 cases (`flutter-reschedule-branch-current.log`). Source and
  local widget repair verified; real device journey remains open.

### LR-036 — Failed native token writes expose a mixed account pair (P1)

- **Root cause/impact:** independent access/refresh writes could partially
  fail, leaving one credential from the new login and one from the previous
  account. Repository error handling did not make that raw pair unreadable.
  Source: `med-super/lib/core/storage/secure_storage_service.dart`.
- **Repair:** write a durable pending marker before either token changes;
  reads/refresh/rejected-session cleanup refuse marked pairs. Clear the marker
  only after both writes or both cleanup deletes succeed. Cleanup failure
  retains the guard; unmarked legacy complete pairs remain compatible.
  Generation changes during native login/rotation writes discard the stale
  pair while still owning the existing mutation queue, without invalidating
  a later reserved generation. No new storage dependency or credential format.
- **Evidence:** `flutter-partial-token-write-red.log`: two partial-write
  regressions fail, three normal controls pass. Expanded storage/network/auth
  gate56 passes, including failed marker writes/removal, failed token cleanup,
  simulated reopen, legacy compatibility, recovery and delayed native writes.
  Full Flutter gate629 passes. Scripted platform storage is proof of source
  behavior, not hardware-backed Android/iOS keystore verification.

### LR-037 — SDK37 cannot be resolved by the pinned Android toolchain (P1)

- **Evidence:** actual debug build installs `platforms;android-37.0` but
  AGP9.0.1 then fails resolving numeric `compileSdk=37`. The SDK's own
  `source.properties` reports API37.0; no fake alias/copy of installed SDKs
  was created. The CI workflow also installed the mismatched 37.2 package.
- **Repair:** pin AGP9.1.1 and its minimum Gradle9.3.1; use SDK37.0 and
  build-tools36.0.0 in CI. Keep Kotlin2.3.20, JDK17, compileSdk37 and targetSdk36.
  Compatibility source: [official AGP9.1.1 notes](https://developer.android.com/build/releases/agp-9-1-0-release-notes).
- **Verification:** actual build and final-tree incremental build succeed,
  the latter77.7s/exit0 on2026-10-04, with process-only JDK/short socket
  settings (`flutter-apk-final-tree.log`). APK185328990 bytes; SHA256 and
  packaged SDK/application/ABI metadata are recorded in the evidence log.
  Required Android SDK34/35/36/37.0 and CMake3.22.1 installed via the build;
  no global proxy/JDK/Gradle configuration changed. Default BASE_URL unset:
  mock/debug artifact, no staging device or store-release acceptance result.

### LR-038 — Status and quoted amount overflow at large text (P2)

- **Evidence:** realistic order UUID, quote120.00EGP and long valid statuses
  at320px /2x text fail in all four lab/pharmacy AR/EN combinations.
  `flutter-order-detail-accessibility-red.log` records horizontal overflow
  including170px for the quote row. Existing wide2400px fixture setup can
  hide this boundary; the new cases explicitly override that surface.
- **Repair:** both detail status/identity rows and quote totals wrap with
  spacing, preserving the full status, ID, icon and monetary amount. No
  amount truncation, smaller forced font or new UI abstraction.
- **Verification:** four accessibility cases plus eight list/detail polling
  controls pass (`flutter-order-detail-accessibility-green.log`). Tests assert
  the complete quote string and actual Arabic RTL/English LTR direction.
  Full629 Flutter tests pass (`flutter-test-accessibility-final.log`). This
  proves widget layout only; screen-reader/device acceptance remains open.

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

### PM-SEC-01 — Pharmacy access to patient prescriptions (approved 2026-10-03)

**Approved rule**: pharmacy staff read and review patient prescriptions only
through orders authorized for their own branch. The former platform-wide
staff prescription queue/read/review routes are removed. Backend `315a02a`
implements this decision; the owning pharmacy application service enforces
order scope before calling the exported prescription service. There is no
new global pharmacist role. Live dashboard/provider verification remains a
release gate. The options below preserve decision history only.

**Problem**: PHI exposure far wider than any single order needs. Patients
upload a prescription to get it filled, not to have every pharmacy on the
platform see it.

**Options**
- **A: branch-scoped.** Pharmacy staff can read a prescription only when it
  is attached to a pharmacy order broadcast to, or claimed by, their branch.
  The global review queue is removed or emptied for pharmacies. Smallest
  exposure. Prescription review then happens inside the order flow, which
  the dashboard already uses (orders embed the prescription summary).
  Impact: the check must live in `pharmacy-fulfillment`, which already
  depends on `prescriptions`, so `GET /v1/prescriptions[/:id]` for
  `PHARMACY_STAFF` either moves behind an order route or is removed. The
  external `medsuper-pharmacy-dashboard` must be checked for calls to these
  routes (outside this repo).
- **B: central MedSuper pharmacist pool.** Keep a global queue, but only for a
  dedicated platform-pharmacist role, not every pharmacy's staff. Needs a
  new role → new permissions.
- **C: keep as is** for V1, with audit logging of every staff read. Weakest
  privacy position.

**Recommended**: A. It matches how orders are already scoped and needs no
new role.

**Decision**: A approved by the user (branch-order-only). LR-024 no longer
requires a PM answer. This supersedes the earlier open-queue rule in Part 37.4.

### Managed employee identity separation (approved 2026-10-03)

User decision: «حساب موظف يديره الطبيب، مع منع ربطه بحساب مريض أو طبيب».
Doctor-managed clinic employees use an identity separate from personal
PATIENT/DOCTOR accounts. The same shared guard preserves branch-managed
pharmacy/lab staff ownership: all historical memberships, including revoked
rows, must have the same staff role/context/owner. Only a new identity or that
exact owner's revoked employee is provisionable; unrelated OTP-only patient
phones and later personal/other-owner role grants are rejected. Personal
PATIENT + DOCTOR remains legitimate. Shared token issuance/rotation blocks
legacy mixed identities until explicit reviewed account and credential/session
remediation. Suspension and issuance serialize on the same auth lock and revoke
refresh tokens/devices; existing access JWTs retain their configured expiry.
No live remediation or migration is authorized or executed by this audit.

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
| Available slots | patient | implemented; stale past-slot booking rejected (LR-015 fixed) | wired; DST fixed (LR-008), branch reschedule fixed (LR-035) | public | slot repository integration + Flutter tz/affiliation tests | full device journey UNVERIFIED | NEEDS HARDENING | device/API smoke |
| Booking (hold + confirm) | patient | implemented | wired | patient | hold/confirm concurrency integration green | UNVERIFIED end to end | NEEDS HARDENING | payment path gates (§5) |
| Cancellation | patient / doctor | implemented with approved rules | wired; hides after start / once started / for assistants | patient own; doctor own affiliations; assistant 403 | unit + integration + e2e | not on device | NEEDS HARDENING | device smoke; payment-provider refund path (§5) |
| Rescheduling | patient / doctor / assistant | implemented (one step, payment carried over) with approved rules; LR-015 fixed | wired; contract fixed (LR-021) | scoped; assistant to assigned branches | unit + integration + e2e | not on device | NEEDS HARDENING | device smoke |
| Visit status + COMPLETED/NO_SHOW | doctor / assistant | implemented with approved rules | wired; day window, NO_SHOW/TIME_EXPIRED labels | scoped | unit + integration + e2e | not on device | NEEDS HARDENING | run reconciliation per environment (authorization needed); device smoke |
| Appointment lists / detail | patient / doctor | implemented; patient response carries actual branch zone | wired; branch-time display fixed LR-018 | scoped | integration + actual non-Cairo HTTP + Flutter controls | local contract verified; device UNVERIFIED | NEEDS HARDENING | device display/interaction smoke |
| Wallet balance / history | patient | implemented | wired | patient | wallet concurrency integration green | UNVERIFIED | NEEDS HARDENING | contract parity |
| Wallet top-up (Paymob) | patient | implemented | wired, external checkout | patient | unit | no live gateway | **BLOCKED** | Paymob production credentials + live webhook (DEC-001) |
| Wallet transfer / refund request / linked cards / pay bills | patient | none | UI behind `isMock`, `Navigator`-only, release builds refuse the mock URL | — | — | — | **FUTURE** (FEATURE FLAGGED in UI) | backend contract when scheduled; keep UI, no production calls |
| Prescriptions (patient upload) | patient / pharmacy staff | implemented; private storage, signed reads; branch-order staff read/review | wired | patient own; pharmacy staff through authorized branch orders | unit + privacy/concurrency integration | needs live ImageKit/signing | NEEDS HARDENING | live provider/client verification; PM-SEC-01 approved |
| Provider clinical requests | doctor / assistant | implemented | wired | scoped | unit + e2e spec (§1.1) | UNVERIFIED | NEEDS HARDENING | Part 51.10 gates |
| Pharmacy fulfilment | pharmacy staff (dashboard) | implemented | order creation only | branch-scoped | workflow + broadcast integration green | dashboard UNVERIFIED | NEEDS HARDENING | dashboard verification |
| Laboratory (referral orders) | patient / lab staff | implemented | partial | scoped reads (owner / branch staff / originating provider) | unit + e2e (provider) | 400 root-caused (LR-023); code fix on `staging` | BLOCKED | confirm staging migration + device order |
| Notifications | all | implemented, PUSH only | wired | recipient-scoped | dispatch unit + reliability integration green | FCM not verified | **BLOCKED** | FCM credentials; LR-016 |
| Outbox / worker | system | implemented | — | — | unit + integration green | not deployed here | NEEDS HARDENING | Phase 7 ops (restart, health) |
| Audit | system | implemented | — | — | via use-case tests | — | UNVERIFIED | — |
| Media upload (ImageKit) | patient / provider | implemented; parser aggregate caps repaired | wired | reviewed source boundaries | real multipart positive/negative suite 12/12 | live private media unverified | NEEDS HARDENING | ImageKit/signing and concurrency-memory release gates |
| Android release | — | — | signing config present | — | — | no signed build | **BLOCKED** | signed release build + device smoke |
| iOS release | — | — | — | — | — | no macOS toolchain | **BLOCKED** | external verification |

---

## 5. External release gates

None of these can be closed from mocks.

- Historical cloud repository access was blocked by HTTP 403. Current local
  commits above were externally integrated; this continuation has not pushed
  or deployed its working-tree patches. Remote/deployed parity needs fresh proof.
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
2. Local backend unit/integration/HTTP/build/lint and current Flutter629/analyze
   gates and the current mock/debug APK are recorded. Next: signed
   Android/iOS and actual patient/provider device journeys. The four AR/EN
   large-text widget cases are a partial UX gate, not native acceptance.
3. Finish Phase4 contract parity beyond the reviewed appointment, identity,
   clinical and patient-order boundaries. Resume the remaining source review
   with explicit receipts;83/795 is not exhaustive security coverage. Confirm
   LR-023 and migration/source parity on the intended staging environment.
4. Close live-provider gates: select the SMS/OTP provider, exercise FCM/APNs,
   Paymob signed callbacks/refunds and private-media access/expiry with test
   accounts. Credentials/provider decisions have not been supplied in this
   continuation; do not replace these tests with mock success.
5. Rehearse controlled migrations, backup/restore and rollback per environment,
   measure memory/concurrency and operational alerting; deployment and shared
   database changes remain outside this continuation's authorization.
6. Resolve LR-025's deferred admin PHI reason-code/audit contract and finish
   LR-019's remaining documentation reset. Preserve the approved staff and
   branch-order privacy decisions. Final launch acceptance remains open.

## 7. Complexity review and launch recommendations

The requirement anchor is five real journeys: authenticate/switch accounts;
book/change/attend an appointment; create and approve a clinical request;
fulfill a branch-scoped lab/pharmacy order; pay and notify without losing or
duplicating side effects. Actual traffic, maintainers, operational budget and
adoption targets have not been supplied, so no scale or staffing assumptions
justify expanding infrastructure. No architecture rewrite is proposed.

Provisional requirement-to-complexity score: **4/10**, reviewer judgement for
the inspected surfaces, not measured system-wide complexity. The modular
monolith, separate worker, transactional outbox, database locks, module
interfaces and shared authorization solve observed concurrency and privacy
problems. Removing them to reduce file count would discard tested controls.

| Finding | Severity | Evidence and simpler action | Estimated effort |
|---|---|---|---|
| Flutter offline scaffolding without feature consumers | V1 | `core/storage/outbox/` has no feature enqueue/handler callers; `CachePolicy` has no repository consumer. ADR-002 holds offline booking. Keep it inert and stop extending it until an approved offline action exists; do not mistake it for shipped capability. No removal in this patch. | 1–2h for scope/document review; removal estimate requires checking generated DI and existing fixtures |
| Dated documentation treated as implementation truth | V1 | LR-019 and conflicting historic phase/flavor/test claims. Use this canonical register and reset current feature docs against code. | 0.5–1 day, estimate only |
| Happy-path mock contracts hide real boundary failures | V1 | LR-034 mocks have no cursor; LR-035 primary affiliation fallback hid same-affiliation failures. Add realistic boundary fixtures to existing adapters, plus actual HTTP negative evidence, rather than build another integration framework. | Repairs/tests above shipped locally; broaden remaining parity inventory separately |

Maintenance hours per month cannot be estimated responsibly without actual
team time/incident data. First measure incident rate, dependency update effort
and time spent maintaining dormant paths; do not treat guesses as savings.

Recommended continuation criteria are review gates, not permission to delete
data or automatically shut down healthcare workflows:

- Identity/clinical authorization: block release on any reproducible account
  mixing, cross-branch PHI access or bypassed doctor signoff; rerun positive
  and negative boundaries after a relevant change.
- Appointment/order state writes: block release on duplicate active orders,
  stale state transitions or broken branch identity; preserve database locks
  and require real persistence/concurrency evidence.
- Offline booking/cache expansion: remain on HOLD until product authorizes a
  specific action, credential/account scoping and conflict resolution contract.
- Payments, messaging and media: retain a release gate until actual provider
  success/failure/retry and private-access proofs exist. Mock success earns
  no production continuation decision.
- Platform builds: require a reproducible current-source artifact, then a
  signed/device journey before store readiness. A debug build alone does not
  close signing or backend connectivity.

Operational enforcement owner, evaluation window, cost ceiling and numeric
success thresholds remain **unassigned product/operations inputs**. They must
be agreed before automating criteria; none are invented or enforced here.
The decision question is: which dormant/offline or new infrastructure work
would materially help the first real patient/provider launch, versus delaying
the five verified journeys above?
