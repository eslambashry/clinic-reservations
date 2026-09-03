# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**See also `MEMORY.md`** — the structured reference for architecture, folder structure, conventions, ADRs, DB rules, auth flow, API rules, git workflow, testing strategy, and glossary. Update the relevant section of `MEMORY.md` whenever any of those change; if it ever disagrees with this file or `docs/FILE_11_*`/`docs/FILE_12_*`, those win — fix `MEMORY.md` to match.

## Project state

This is the **backend** repo for MedSuper, a healthcare booking/pharmacy platform (Egypt-first launch), built on **NestJS** (File 12 `DEC-B01`). `prisma/schema/*.prisma` fully defines the MVP data model. **Phase 0 (Foundation)** is complete: the NestJS app/worker scaffold and every cross-cutting concern in `src/shared/core/**` are real, working implementations, not stubs. **Phase 1 (Identity & Auth, `src/modules/identity-auth/`)** is complete: OTP request/verify, JWT access + opaque rotating refresh tokens, logout — see that module for the reference example of the `api/application/domain/infrastructure` layering every subsequent module should follow. **Phase 2 (Provider Directory, `src/modules/provider-directory/`)** is complete: directory CRUD + manual verification workflow + public search/detail. **Phase 3 (Scheduling — Availability half only)** is complete: schedule-template CRUD + rolling-window slot generation. **Phase 4 (Appointments — hold/confirm/cancel/reschedule, `src/modules/scheduling-appointments/`)** is complete: concurrency-safe slot claiming, `HoldExpiryJob` reaper, patient-only read/write. **Phase 5 (Payments, `src/modules/payments/`)** is complete: pay-at-clinic ledger mechanics (commission split, cancellation refunds) wired internally into Appointments confirm/cancel — no gateway integration yet, no controller/HTTP surface of its own. **Phase 6 (Prescriptions, `src/modules/prescriptions/`)** is complete: patient-uploaded prescriptions (URL-based), quality-check gate, pharmacist review with a controlled-substance confirmation guard. **Phase 7 (Pharmacy Fulfillment, `src/modules/pharmacy-fulfillment/`)** is complete (merged 2026-08-31 via PR #8, branch `understanding`, including a 2026-08-29 `medsuper-pharmacy-dashboard` integration pass): order creation + branch broadcast, accept/decline, flat-total quote, reject, approve-and-pay, fulfill/complete, plus a pharmacy-staff audit trail (`GET /v1/pharmacy-audit`). Order creation (`POST /v1/pharmacy-orders`) is wired into `med-super` (`pharmacy_order_review_screen.dart`'s confirm CTA); nothing past that is (see `med-super`'s `lib/features/pharmacy_booking/STATUS.md`). File 12 Part 44 (2026-08-31) added a `pharmacyBranchId` field for this and loosened `GetAcceptedPrescriptionForOrderUseCase`'s status/item checks — `ACCEPTED` and per-item `drug_code` only ever come from a `PHARMACY_STAFF` review endpoint that `medsuper-pharmacy-dashboard` never actually calls, so requiring either made every order permanently uncreateable rather than a guarded workflow. **Every module after that (Notifications, Delivery, ...) is still unbuilt** — `src/modules/<name>/README.md` is the one-line source of truth for phase status/MVP vs. POSTPONE; build order follows File 12 Part 10.

The authoritative design doc is `docs/FILE_11_Backend_API_Database_Engineering_Specification.md` — it is organized into numbered PARTs (e.g. "Part 11 — Transactional Integrity", "Part 12 — Appointment Engine") and code comments/READMEs in this repo cite it by part number (e.g. `// File 11 Part 02.3`). When a stub references a part number, read that section before implementing — it defines the exact behavior expected. `docs/FILE_10_Implementation_Readiness_Open_Decisions.md` tracks open/unresolved product decisions (`DEC-XXX`) referenced from File 11; treat anything marked `OPEN DECISION` in either doc as genuinely undecided, not a gap to fill in silently.

**`docs/FILE_12_Engineering_Decisions_And_Conventions.md` is the implementation-authority companion to File 11** — it resolves the engineering-level choices File 11 deliberately left open (framework = NestJS, resolving `DEC-B01`; library choices; the exact per-module folder structure; the phase-by-phase build order). Read it before starting any new module or cross-cutting piece — it exists specifically so those choices are made once, with rationale, instead of improvised differently in each task/prompt. Its Part 12 states the operating rule directly: don't invent a business constant, folder layout, or library choice inline — check File 10/11 for the rule, check File 12 for the pattern, and if neither answers it, add the decision to File 12 first.

## Commands

```bash
npm install                # install deps (package-lock.json is the committed lockfile — not pnpm)
npm run start:dev          # API process, tsx watch (src/main.ts)
npm run start:worker:dev   # worker process, tsx watch (src/worker.ts) — outbox drain + cron jobs
npm run build               # tsc — compiles src/ to dist/ (both entrypoints)
npm run lint                 # eslint src/**/*.ts
npm test                     # jest (unit/integration, *.spec.ts) — passes with 0 tests until Phase 1 adds real ones
npm run test:e2e             # jest against test/*.e2e-spec.ts
npm run db:generate          # prisma generate (regenerate client after schema changes)
npm run db:migrate           # prisma migrate dev (local schema changes -> new migration)
npm run db:migrate:deploy    # prisma migrate deploy (apply existing migrations, e.g. in CI/prod)
npm run db:seed              # tsx src/db/seed.ts (idempotent: seeds a CANCELLATION_TIER policy_config + baseline specialties)
npm run db:studio            # prisma studio
```

Requires a `.env` (copy `.env.example`) — `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `REDIS_ENABLED`, and `JWT_ACCESS_SECRET` are validated at boot (`src/shared/config/env.validation.ts`) and the process exits immediately if any is missing/malformed, rather than failing on first use.

Database: Neon Postgres. `DATABASE_URL` (pooled, PgBouncer, `sslmode=require`) is used for app runtime queries; `DIRECT_URL` (direct connection) is used for migrations. The Nest app (both processes) uses `PrismaService` (`src/shared/kernel/prisma/`) via DI; `src/db/client.ts`'s plain singleton is only for the standalone `db:seed` script, which runs outside the Nest container.

## Architecture

**Modular monolith, not microservices** — this was a deliberate correction against the original SRS's "15 microservices" framing (File 11 Part 02.1). One deployable API process + one background worker process + a logically separate audit store. Module boundaries are designed so each module *could* become a real service later, so the boundary discipline matters now even though everything runs in one process against one physical Postgres database:

- **No cross-module table joins.** A module only reads another module's data through an internal service call/interface, never a direct Prisma join across module ownership lines — even though nothing at the DB level stops you from writing one.
- **Cross-cutting concerns are implemented once, centrally**, in `src/shared/core/` (registered globally by `core.module.ts`, in the order Throttler → `JwtAuthGuard` → `RbacGuard` → handler → `ResponseInterceptor`/`ErrorEnvelopeFilter`): auth (`auth/jwt-auth.guard.ts`, `auth/rbac.guard.ts`, `@Roles()`/`@Permissions()`/`@CurrentUser()`/`@Public()` decorators), correlation-ID propagation (`context/request-context.service.ts` + `middleware/correlation-id.middleware.ts`, via Node `AsyncLocalStorage`), structured logging (`logging/logging.module.ts`, `nestjs-pino`), error-envelope normalization (`errors/domain-errors.ts` + `errors/error-envelope.filter.ts`), success-envelope mirroring (`http/response.interceptor.ts`), idempotency-key handling (`idempotency/idempotency-key.interceptor.ts`, applied per-route not globally), transactional outbox (`outbox/outbox.service.ts` write side, `outbox/outbox.worker.ts` drain side — worker-process-only, see below). Never reimplement these per module — inject/extend what's here.
- **Layering** (File 11 Part 02.2): every domain module under `src/modules/<name>/` follows `api/ → application/ → domain/ → infrastructure/` (File 12 Part 05) — routing+DTOs, use-case orchestration/transaction boundaries, framework-free business rules, Prisma-backed repositories. Dependencies point strictly downward; a module is only called by another module through its exported application-layer service, never by reaching into its `infrastructure/`.
- **Two processes, one codebase**: `src/main.ts` (API, HTTP) and `src/worker.ts` (background — outbox drain + `@nestjs/schedule` cron jobs) both bootstrap the same domain modules (`src/app.module.ts`; the worker wraps it in `src/worker.module.ts` to add `ScheduleModule`/`OutboxWorker` without the API process also running them). Business logic is written once and used by both.

### Module map (`src/modules/`, schema in `prisma/schema/`)

| Status | Modules |
|---|---|
| **MVP** | identity-auth, provider-directory, scheduling-appointments, prescriptions (patient-uploaded only), pharmacy-fulfillment, payments (pay-at-clinic only), notifications (transactional/informational tiers only), audit, delivery (pickup-first tracking only), laboratory (2026-09-02, File 12 Part 47 — no auth bridge yet for `medsuper-laboratory-dashboard`, see that Part) |
| **POSTPONE** | encounter-emr, reviews, fraud, analytics, family-accounts |

POSTPONE modules have a schema in `prisma/schema/postponed.prisma` for forward-compatibility but no logic should be built for them without an explicit product decision to un-postpone.

### Data model conventions (apply to every new table/model)

- `id` is a UUID primary key; FK columns are named `<referenced_table_singular>_id`.
- Every stateful table carries `version Int @default(1)` for **optimistic locking** — updates go through the `updateWithOptimisticLock` helper (`src/shared/kernel/prisma/optimistic-lock.ts`, re-exported from `src/db/client.ts` for the seed script), which does `updateMany({ where: { id, version } , data: { ...data, version: { increment: 1 } } })` and throws `OptimisticLockError` if 0 rows matched — caught by `ErrorEnvelopeFilter` and returned as `409 OPTIMISTIC_LOCK_CONFLICT`.
- `created_at`/`updated_at` (`@db.Timestamptz`) on every table; real-world entities also get a nullable `deleted_at` for soft deletion — nothing is hard-deleted.
- Enums are native Postgres enums mapped via `@@map("<table>_<column>_enum")`.
- Money is `Decimal @db.Decimal(10, 2)`; currency is a `Char(3)` code, not embedded in the amount.
- Polymorphic references (e.g. `PaymentIntent.payable_type` + `payable_id` covering both `Appointment` and `PharmacyOrder`) are the pattern for "one shared table referenced by several owners" — `payment_intents` is intentionally one table, not per-module payment tables.

### Concurrency-critical paths — read File 11 Part 11 before touching these

- **Appointment hold**: a slot can have at most one `ACTIVE` hold, enforced by a partial unique index on `appointment_holds (slot_id) WHERE status='ACTIVE'` — DB-enforced, not app-checked-then-acted. Losing a race returns `409 SLOT_ALREADY_HELD`.
- **Hold confirm/payment**: `appointments.status → CONFIRMED` and `payment_intents.status → CAPTURED` (or pay-at-clinic equivalent) happen in **one transaction**, with a row lock (`SELECT ... FOR UPDATE`) on the appointment — never two separate commits.
- **Pharmacy broadcast accept (first-accept-wins)**: `UPDATE ... WHERE id=? AND version=? AND pharmacy_branch_id IS NULL` — a 0-row update means another pharmacy already claimed it, translated to `409 ORDER_ALREADY_CLAIMED`.
- **Webhook idempotency**: insert into `webhook_events` (unique `idempotency_key`) *before* any side effect runs; a unique-constraint failure means "already processed," not an error to surface.
- All of the above use mutating writes guarded by `Idempotency-Key` request headers — repeat requests with the same key must be safe no-ops, not duplicate side effects.

### API conventions (File 11 Part 04/06)

- Base path `/v1`; additive changes never bump the version, only breaking changes do.
- Standard error envelope: `{ success: false, error: { code, message, details, requestId, correlationId } }` (mirrored on success as `{ success: true, data, requestId, correlationId }`, File 12 Part 07) — no raw DB errors, stack traces, or file paths ever reach a client response; this is enforced in exactly one place, `ErrorEnvelopeFilter`. Use-cases throw the `AppError` subclasses in `errors/domain-errors.ts` (`ConflictError`, `BusinessRuleError`, `NotFoundError`, ...) — never a bare `Error`.
- Status codes: `409` for conflict (double-hold, idempotency-key reuse), `422` for a syntactically valid request that violates a business rule (distinct from `400` validation errors) — e.g. cancelling an already-completed appointment is `422`, not `400`.
- All timestamps are `timestamptz`, API responses are UTC ISO-8601; local time only matters for displaying a branch's working hours, which is why `clinic_branches`/`pharmacy_branches` carry an explicit `iana_timezone` column.

### Identity & Auth (`src/modules/identity-auth/` — the reference module)

- Endpoints (File 11 05.1 / File 10 §2.3): `POST /v1/auth/otp/{request,verify}`, `POST /v1/auth/token/refresh`, `POST /v1/auth/logout` — all `@Public()`; refresh/logout authenticate via the refresh token in the body, not a bearer header.
- OTP codes are argon2-hashed (low-entropy, needs slow/salted verification); refresh tokens are SHA-256-hashed (high-entropy 384-bit random value, needs a *deterministic* hash so `/refresh`/`/logout` can look the row up by the token the client presents — argon2 can't do that, it salts every hash differently). Don't swap these — see File 12 Part 04.
- Refresh rotates on every use (`refresh_tokens.rotated_from_token_id`); replaying an already-rotated (revoked) token is treated as a theft signal — **all** of that user's active refresh tokens are revoked (not just a reconstructed per-device family — simpler and safer, File 12 Part 07), forcing full re-auth.
- `VerifyOtpUseCase` is deliberately **not** one transaction end-to-end: a failed-attempt increment on `otp_requests.attempts` must commit even though the same call throws afterward — if it were inside the transaction that gets rolled back on throw, the "5 attempts then lock" rule would silently never engage. Only the success path (consume OTP → find/create user → ensure `PATIENT` role_membership → issue tokens → emit outbox event) is atomic. Read this use-case before assuming "wrap the whole handler in `$transaction`" is always correct.
- No SMS provider is chosen yet (File 10 Part 4 `OPEN DECISION`) — `OtpSenderPort`/`LoggingOtpSender` logs the code instead of sending it (never enable in production). Swap the DI binding in `identity-auth.module.ts` once a provider is picked; the use-case doesn't change.
- A user's active JWT role-context is resolved by taking their first active `role_membership` — correct for now because Phase 1 users only ever have one (`PATIENT`, auto-provisioned on first verify). Which membership should be "active" once a user can have more than one (Phase 2+, provider staff) is genuinely unresolved by File 11 and is **not** guessed at in the code — flagged inline in `verify-otp.use-case.ts`/`refresh-token.use-case.ts`.

### Events

Async work (notifications, cross-module reactions) goes through a **transactional outbox** (`outbox_events` table, `prisma/schema/shared.prisma`): a use-case calls `OutboxService.emit(tx, eventName, payload)` with the *same* Prisma transaction client (`tx`) it used for the business change, so the event row commits atomically with it — never a direct post-commit call that could fail silently and desync state from the notification. `OutboxWorker` (worker process only) drains `PENDING` rows with `SELECT ... FOR UPDATE SKIP LOCKED`, retries failures up to `OUTBOX_CONSTANTS.MAX_ATTEMPTS` (`src/shared/config/constants.ts`), then marks the row `FAILED`. A consuming module registers itself via `outboxWorker.registerHandler({ eventName, handle })` from its own `onModuleInit`. Identity already emits `UserRegistered`/`UserLoggedIn` (File 11 Part 03's stated emits for that module) even though no consumer exists yet (Notifications is Phase 8) — an event with no registered handler is left `PENDING` (not `FAILED`; it doesn't burn a retry attempt) until a handler eventually registers, so this is expected quiet backlog, not a bug to chase. Not Kafka/RabbitMQ — Postgres-native, per File 12 `DEC-B05`.
