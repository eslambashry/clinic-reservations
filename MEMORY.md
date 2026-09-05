# MEMORY.md

Persistent project reference for Claude Code. This file is a **living document** — whenever architecture, folder structure, conventions, ADRs, database rules, auth flow, API rules, git workflow, testing strategy, or commands change, update the relevant section here in the same commit/session as the change. Do not let this drift from reality; prefer trimming a stale section over leaving it wrong.

This complements (does not replace) `CLAUDE.md` — `CLAUDE.md` is the authoritative onboarding doc read at session start; this file is the deeper, structured reference for architecture/conventions detail. If the two ever disagree, `CLAUDE.md` and `docs/FILE_11_*`/`docs/FILE_12_*` win; fix this file to match.

---

## 1. Project Overview

**MedSuper** — healthcare booking/pharmacy platform, Egypt-first launch. This repo is the **backend only**: a NestJS modular monolith (API + worker processes) backed by Neon Postgres (via Prisma) and Redis. There is **no Flutter/mobile client code in this repo** — a Flutter frontend exists in a separate repo (referenced in `docs/FILE_12_...md` Part 34 as `med-super/docs/backend_frontend_parity_matrix.md`); cross-repo contract mismatches get resolved via ADRs (see §8) and land here as backend changes. If a future session adds a Flutter app into this repo, replace this paragraph with real architecture details gathered the same way the rest of this file was (read the code, don't assume).

Authoritative specs (read before building anything non-trivial):
- `docs/FILE_11_Backend_API_Database_Engineering_Specification.md` — the *what* (architecture, API contract, schema, transactional rules), organized into numbered Parts.
- `docs/FILE_12_Engineering_Decisions_And_Conventions.md` — the *how* (framework/library choices, folder layout, naming, build order, ADR pointers). Read Part 12 of this file before inventing any constant/pattern/library choice.
- `docs/FILE_10_Implementation_Readiness_Open_Decisions.md` — tracks `DEC-XXX` open product decisions. Anything marked `OPEN DECISION` is genuinely undecided — don't silently resolve it in code.

---

## 2. Overall Architecture

**Modular monolith, not microservices** (deliberate correction vs. the original SRS's "15 microservices" framing — File 11 Part 02.1). Module boundaries are designed so each module *could* become a real service later, so boundary discipline matters now even though everything runs in one process against one Postgres database.

- **No cross-module table joins.** A module reads another module's data only through an internal service call/interface — never a direct Prisma join across module ownership lines.
- **Two processes, one codebase**: `src/main.ts` (API/HTTP) and `src/worker.ts` (background — outbox drain + `@nestjs/schedule` cron). Both bootstrap `src/app.module.ts`; the worker wraps it in `src/worker.module.ts` to add `ScheduleModule`/`OutboxWorker` without the API process also running them. Business logic is written once, used by both.
- **Events via transactional outbox** (`outbox_events` table, `prisma/schema/shared.prisma`), Postgres-native — not Kafka/RabbitMQ (`DEC-B05`). A use-case calls `OutboxService.emit(tx, eventName, payload)` with the *same* transaction client used for the business change, so the event commits atomically. `OutboxWorker` (worker process only) drains `PENDING` rows with `SELECT ... FOR UPDATE SKIP LOCKED`, retries to `OUTBOX_CONSTANTS.MAX_ATTEMPTS`, then marks `FAILED`. Consumers register via `outboxWorker.registerHandler({ eventName, handle })` in their own `onModuleInit`. An event with no registered handler stays `PENDING` (not `FAILED`) — expected quiet backlog, not a bug.

---

## 3. Backend Architecture (NestJS)

Runtime/framework decisions (`docs/FILE_12` Part 02–04, resolving `DEC-B01`):
- **NestJS 10**, Express platform, `@nestjs/config`, `@nestjs/jwt`, `@nestjs/schedule`, `@nestjs/swagger`, `@nestjs/throttler`.
- **Prisma 5** ORM against **Neon Postgres**: `DATABASE_URL` (pooled/PgBouncer, `sslmode=require`) for runtime queries, `DIRECT_URL` (direct) for migrations.
- **Redis** via `ioredis` (rate limiting, e.g. OTP phone rate limiter).
- **Logging**: `nestjs-pino` + `pino`/`pino-http`, structured JSON, correlation-ID enriched.
- **Auth**: `argon2` (OTP hashing — slow/salted), SHA-256 (refresh token hashing — deterministic lookup), `@nestjs/jwt` (access tokens).
- **Validation**: `class-validator` + `class-transformer` on DTOs.
- **Dates/timezones**: `luxon` (branches carry `iana_timezone`; all storage/API timestamps are UTC).
- **Tests**: `jest` + `ts-jest` (unit/integration `*.spec.ts`), separate `test/jest-e2e.json` config for `*.e2e-spec.ts`.
- **Dev runtime**: `tsx watch` for both entrypoints; `tsc` for production build → `dist/`.

**Global middleware/guard/interceptor order** (registered once, centrally, in `core.module.ts`): `Throttler → JwtAuthGuard → RbacGuard → handler → ResponseInterceptor/ErrorEnvelopeFilter`. Never reimplement any of this per-module — extend what's in `src/shared/core/`.

**Cross-cutting concerns, all in `src/shared/core/`** (one real implementation each, injected/extended, never duplicated per module):
| Concern | Location |
|---|---|
| Auth guards/decorators | `auth/jwt-auth.guard.ts`, `auth/rbac.guard.ts`, `@Roles()`/`@Permissions()`/`@CurrentUser()`/`@Public()`/`@OptionalAuth()` |
| Correlation ID | `context/request-context.service.ts` + `middleware/correlation-id.middleware.ts` (Node `AsyncLocalStorage`) |
| Structured logging | `logging/logging.module.ts` |
| Error envelope | `errors/domain-errors.ts` + `errors/error-envelope.filter.ts` |
| Success envelope | `http/response.interceptor.ts` |
| Idempotency keys | `idempotency/idempotency-key.interceptor.ts` (applied per-route, not global) |
| Transactional outbox | `outbox/outbox.service.ts` (write), `outbox/outbox.worker.ts` (drain, worker-process only) |
| Cursor pagination | `pagination/cursor.util.ts` (`encodeCursor`/`decodeCursor`, opaque base64 JSON — shared since Phase 2) |
| Prisma/optimistic locking | `src/shared/kernel/prisma/` (`PrismaService`, `optimistic-lock.ts`) |
| Redis client | `src/shared/kernel/redis/` |

---

## 4. Flutter / Mobile Client

**Not in this repository.** No Flutter code, `pubspec.yaml`, or mobile app directory exists here — confirmed by directory scan. A Flutter frontend exists in a sibling repo (`med-super`); cross-repo contract gaps between it and this backend get resolved as ADRs (e.g. ADR-005, §8) and implemented here. Do not fabricate Flutter architecture details — if this repo ever gains a Flutter client, populate this section from the actual code at that time.

---

## 5. Folder Structure

```
src/
  main.ts                 # API process entrypoint (HTTP)
  worker.ts                # Worker process entrypoint (outbox drain + cron)
  app.module.ts             # Shared root module, bootstrapped by both processes
  worker.module.ts          # Wraps app.module.ts, adds ScheduleModule/OutboxWorker
  db/                       # Standalone seed script (src/db/seed.ts) + plain Prisma singleton (src/db/client.ts) — outside the Nest DI container
  health/                   # Health-check endpoint
  shared/
    config/                 # env.validation.ts (boot-time env checks), constants.ts (business constants registry)
    core/                   # Cross-cutting concerns — see §3 table
    kernel/
      prisma/                # PrismaService, optimistic-lock.ts
      redis/                 # Redis client wrapper
  modules/
    <module-name>/
      README.md              # One-line source of truth: MVP vs POSTPONE for this module
      api/                    # Controllers + DTOs (routing, request/response shape)
      application/            # Use-cases: orchestration, transaction boundaries
      domain/                 # Framework-free business rules (pure functions/classes)
      infrastructure/         # Prisma-backed repositories, external ports/adapters
      <module-name>.module.ts

prisma/
  schema/*.prisma            # One file per bounded context (identity, provider-directory, scheduling, prescriptions, pharmacy, laboratory, payments, notifications, audit, shared, postponed)

docs/
  FILE_10_..., FILE_11_..., FILE_12_...   # Spec / decisions / conventions (see §1)

test/
  *.e2e-spec.ts               # End-to-end tests (separate jest config)
```

**Layering rule** (File 11 Part 02.2 / File 12 Part 05): every module follows `api/ → application/ → domain/ → infrastructure/`, dependencies point strictly downward. A module is only ever called by another module through its exported **application-layer** service — never by reaching into its `infrastructure/`. Putting a Prisma call directly in a controller is a defect, not a style preference.

**Reference implementation**: `src/modules/identity-auth/` — read it before starting any new module.

---

## 6. Coding Standards

- TypeScript, strict-ish via `tsconfig.json`; ESLint (`@typescript-eslint`, flat config in `eslint.config.js`) — `no-unused-vars` is a warn (ignoring `^_`-prefixed args), `no-explicit-any` is off.
- Use-cases/domain code throw `AppError` subclasses (`src/shared/core/errors/domain-errors.ts`) — **never** a bare `Error` or raw Nest `HttpException`. `ErrorEnvelopeFilter` is the *only* place that translates exceptions to the client-facing envelope.
- No raw DB errors, stack traces, or file paths ever reach a client response.
- No comments explaining *what* code does (names should do that); comments only for non-obvious *why* (hidden constraints, workarounds, spec citations like `// File 11 Part 02.3`).
- Don't add abstractions, error handling, or validation for scenarios that can't happen; don't build ahead of the current Phase (File 12 Part 10 build order) even though tables for later phases already exist in the schema.
- Every new business constant (fee, TTL, grace period, limit) comes from `policy_configs` (if Admin-tunable) or is added to File 12 Part 08's registry with its source cited — never a bare literal inside a use-case.

---

## 7. Naming Conventions

(File 11 Part 08 / File 12 Part 09 — already reflected in `prisma/schema/*`)

| Layer | Convention |
|---|---|
| DB tables/columns | `snake_case`; enums mapped via `@@map("<table>_<column>_enum")` |
| FK columns | `<referenced_table_singular>_id` |
| Primary keys | `id`, UUID |
| DTO fields (API layer) | `camelCase` — mapped to `snake_case` Prisma models **only** at the repository boundary in `infrastructure/`; never let either convention leak into the wrong layer |
| REST routes | Plural nouns, `kebab-case` for multi-word (`/v1/pharmacy-orders`) |
| Error codes | `SCREAMING_SNAKE_CASE`, categorized (Authentication/Authorization/Validation/Conflict/...) per File 11 Part 06's table — never invented ad hoc per endpoint |
| Money | `Decimal @db.Decimal(10,2)` + separate `Char(3)` currency code — never embed currency in the amount |
| Timestamps | `created_at`/`updated_at` (`@db.Timestamptz`) on every table; nullable `deleted_at` for soft delete (nothing is hard-deleted) |
| Optimistic lock | `version Int @default(1)` on every stateful table |

---

## 8. ADR / Decision Log

Full decisions live in `docs/FILE_10_...`, `docs/FILE_11_...`, and `docs/FILE_12_Engineering_Decisions_And_Conventions.md` (Parts 32–34+ hold phase-specific ADR-style entries). Key resolved decisions to remember without re-reading the source docs:

| ID | Decision |
|---|---|
| `DEC-B01` | Framework = **NestJS 10** (File 12 Part 02) |
| `DEC-B05` | Outbox is **Postgres-native** (`outbox_events` table), not Kafka/RabbitMQ |
| `DEC-B08` | Access token TTL 30 min, refresh token TTL 30 days (recommended defaults) |
| `DEC-B09` | Rate limits: conservative per-endpoint defaults, tuned from real traffic later — not a product decision to seek approval for |
| `DEC-B11` | No-show grace period: 15 min |
| `DEC-001`/`DEC-B02`/`DEC-B03`/`DEC-B06`/`DEC-B07` | **OPEN** — payment gateway, secrets manager, WAF, cross-region backup, upload virus scanning. Not needed until the phase that requires them; do not pre-integrate speculatively. |
| **ADR-005** | Provider self-registration intake endpoint (`POST /v1/provider/registration`), added after the Flutter frontend was found calling an endpoint with no backend counterpart. Full record lives in the sibling `med-super`/`MedSuper_Docs_Reorganization` repo (`docs/decisions/ADR-005-PROVIDER-SELF-REGISTRATION.md`), **not** in this repo — File 12 Part 34 is a pointer, not a duplicate. Resolution: update/verify/suspend stay Admin-only exactly as originally decided (File 12 Part 32 item 4); a separate, narrower authenticated intake endpoint lets a non-Admin submit a `PENDING` application, still requiring Admin `verify` before it's visible. |

**Operating rule** (File 12 Part 12): before implementing anything not explicitly covered by File 10/11/12, stop and add the decision to File 12 first (with rationale) — don't decide it inline as a side effect of an unrelated task.

---

## 9. Database Conventions

- Postgres (Neon) via Prisma; migrations via `DIRECT_URL`, runtime via pooled `DATABASE_URL`.
- **Optimistic locking**: every stateful table has `version Int @default(1)`; updates go through `updateWithOptimisticLock` (`src/shared/kernel/prisma/optimistic-lock.ts`) — `updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } })`, throws `OptimisticLockError` on 0 rows matched → `ErrorEnvelopeFilter` → `409 OPTIMISTIC_LOCK_CONFLICT`.
- Soft delete only (`deleted_at`), never hard delete real-world entities.
- Polymorphic references pattern: one shared table referenced by several owner types via `<x>_type` + `<x>_id` (e.g. `PaymentIntent.payable_type`/`payable_id` covering `Appointment` and `PharmacyOrder`) — not per-module payment tables.
- **Concurrency-critical paths** (read File 11 Part 11 before touching):
  - Appointment hold: partial unique index `appointment_holds(slot_id) WHERE status='ACTIVE'` — DB-enforced, not app-checked-then-acted. Race loser gets `409 SLOT_ALREADY_HELD`.
  - Hold confirm/payment: `appointments.status → CONFIRMED` and `payment_intents.status → CAPTURED` in **one transaction** with `SELECT ... FOR UPDATE` on the appointment.
  - Pharmacy first-accept-wins: `UPDATE ... WHERE id=? AND version=? AND pharmacy_branch_id IS NULL`; 0 rows → `409 ORDER_ALREADY_CLAIMED`.
  - Webhook idempotency: insert into `webhook_events` (unique `idempotency_key`) **before** any side effect; unique-constraint failure means "already processed," not an error.
  - All mutating writes on these paths are guarded by an `Idempotency-Key` request header — repeat requests with the same key must be safe no-ops.

---

## 10. Authentication Flow

Reference module: `src/modules/identity-auth/`.

- Endpoints (all `@Public()`): `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify`, `POST /v1/auth/token/refresh`, `POST /v1/auth/logout`. Refresh/logout authenticate via the refresh token **in the body**, not a bearer header.
- OTP codes: **argon2**-hashed (low-entropy, needs slow/salted verification).
- Refresh tokens: **SHA-256**-hashed (high-entropy 384-bit random value — needs a deterministic hash so `/refresh`/`/logout` can look the row up by the presented token; argon2 salts differently every time so it can't be used for lookup). **Never swap these two hashing choices.**
- Refresh rotates on every use (`refresh_tokens.rotated_from_token_id`). Replaying an already-rotated token is treated as a **theft signal**: ALL of that user's active refresh tokens are revoked (not just a per-device family — simpler and safer per File 12 Part 07), forcing full re-auth.
- `VerifyOtpUseCase` is deliberately **not** one end-to-end transaction: the failed-attempt increment on `otp_requests.attempts` must commit even when the same call throws afterward (otherwise "5 attempts then lock" would silently never engage). Only the success path (consume OTP → find/create user → ensure `PATIENT` role_membership → issue tokens → emit outbox event) is atomic.
- No SMS provider chosen yet (File 10 Part 4, `OPEN DECISION`) — `OtpSenderPort`/`LoggingOtpSender` just logs the code. **Never enable the logging sender in production.** Swap the DI binding in `identity-auth.module.ts` once a provider is picked.
- A user's active JWT role-context = their first active `role_membership` — correct only because Phase 1 users have exactly one (`PATIENT`, auto-provisioned on first verify). Which membership is "active" once a user can have more than one (Phase 2+, provider staff) is **genuinely unresolved**, flagged inline in `verify-otp.use-case.ts`/`refresh-token.use-case.ts` — don't silently pick a resolution.
- Global guard order: `JwtAuthGuard → RbacGuard`. `@Roles()`/`@Permissions()` for authorization; `@CurrentUser()` to access the authenticated principal; `@Public()` for no-auth routes; `@OptionalAuth()` (added Phase 2) for routes that are public but unlock extra detail for an authenticated Admin (verifies a token if present, never throws if absent).

---

## 11. API Design Rules

(File 11 Part 04/06, File 12 Part 09)

- Base path `/v1`. Additive changes never bump the version — only breaking changes do.
- **Standard envelope**:
  - Success: `{ success: true, data, requestId, correlationId }`
  - Error: `{ success: false, error: { code, message, details, requestId, correlationId } }`
  - Mirrored automatically by `ResponseInterceptor`/`ErrorEnvelopeFilter` — never hand-construct either shape in a controller.
- **Status codes**: `409` conflict (double-hold, idempotency-key reuse), `422` business-rule violation on an otherwise syntactically valid request (distinct from `400` validation errors) — e.g. cancelling an already-completed appointment is `422`, not `400`.
- All timestamps are `timestamptz`, API responses are UTC ISO-8601; local time only matters for displaying working hours (branches carry `iana_timezone`).
- Cursor pagination: shared `src/shared/core/pagination/cursor.util.ts` (opaque base64 JSON cursor) — don't build a bespoke pagination scheme per module.
- Admin routes are **not** namespaced under `/admin` — authorization is via `@Roles(ADMIN)` on the route, not the URL path.

---

## 12. Git Workflow

- Conventional-commit-style messages: `feat:`, `fix:`, plain imperative for housekeeping (e.g. `remove un neccesary files`) — observed convention, not a hard-enforced hook.
- Working branch pattern observed: feature/phase branches off `main` (currently `foundation`), pushed to `origin`.
- No CI/hook config discovered yet in this repo (no `.github/workflows`, no `husky` in `package.json` devDependencies as of this writing) — verify before assuming a pre-commit/CI gate exists.
- Follow the root-level Git Safety Protocol already in effect for this session (no force-push to main, no `--no-verify`, new commits not amends, confirm before anything destructive).

---

## 13. Testing Strategy

- **Unit/integration**: `*.spec.ts` colocated next to the code under test (e.g. `domain/*.rules.spec.ts`, `application/*.use-case.spec.ts`, `infrastructure/*.repository.integration.spec.ts`), run via `npm test` (jest + ts-jest). Passes with 0 tests until a module adds real ones — an empty suite is not a red flag pre-Phase-1.
- **E2E**: `test/*.e2e-spec.ts`, separate config (`test/jest-e2e.json`), run via `npm run test:e2e`.
- Domain-layer tests are framework-free, pure-function style (see `slot-generation.rules.spec.ts`) — assert exact boundaries/timezone conversions, not just "doesn't throw."
- **Concurrency-critical paths get concurrency tests written alongside the feature, not after** (File 11 Part 26, explicit requirement) — appointment hold and pharmacy first-accept-wins are the two named paths so far. A phase without a documented concurrency-critical path (e.g. Provider Directory verify/suspend, protected only by optimistic locking) intentionally has no N-simultaneous-requests test — don't add one speculatively.
- `npm run test:cov` for coverage; `npm run test:watch` during active development.

---

## 14. Common Commands

```bash
npm install                  # install deps (package-lock.json is committed — npm, not pnpm/yarn)
npm run start:dev            # API process, tsx watch (src/main.ts)
npm run start:worker:dev     # worker process, tsx watch (src/worker.ts)
npm run build                # tsc -> dist/ (both entrypoints)
npm run lint                 # eslint src/**/*.ts
npm test                     # jest unit/integration
npm run test:watch
npm run test:cov
npm run test:e2e             # jest against test/*.e2e-spec.ts
npm run db:generate          # prisma generate (after schema changes)
npm run db:migrate           # prisma migrate dev (local)
npm run db:migrate:deploy    # prisma migrate deploy (CI/prod)
npm run db:seed              # tsx src/db/seed.ts (idempotent)
npm run db:studio            # prisma studio
```

Requires `.env` (copy `.env.example`): `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `REDIS_ENABLED`, `JWT_ACCESS_SECRET` are validated at boot (`src/shared/config/env.validation.ts`) — process exits immediately if missing/malformed, not on first use. Local Postgres+PostGIS+Redis available via `docker-compose.yml`.

---

## 15. Development Workflow

1. Check `src/modules/<name>/README.md` for MVP vs. POSTPONE status before starting any module work.
2. Follow the File 12 Part 10 build order (Foundation → Identity & Auth → Provider Directory → Availability → Appointments → Payments → Prescriptions → Pharmacy Fulfillment → Notifications → Delivery → hardening). Don't build ahead of the current phase.
3. Before implementing anything not explicitly covered by File 10/11/12, stop and add the decision to File 12 first.
4. New module scaffolding follows the reference module (`identity-auth`) exactly: `api/ → application/ → domain/ → infrastructure/`.
5. Business rules go in `domain/` (framework-free); orchestration + transaction boundaries in `application/`; Prisma access only in `infrastructure/`.
6. Cross-cutting needs (auth, logging, errors, outbox, idempotency, pagination) → extend `src/shared/core/`, never reimplement locally.
7. Run `npm run lint` and the relevant `*.spec.ts` suite before considering a module change done.

---

## 16. Things to Avoid

- Don't cross module boundaries with a direct Prisma join — always go through the other module's application-layer service.
- Don't throw a bare `Error` or Nest `HttpException` from domain/application code — use `AppError` subclasses.
- Don't wrap `VerifyOtpUseCase`-style flows in a single `$transaction` without checking whether a partial-commit (e.g. failed-attempt counter) is actually required outside it.
- Don't swap OTP (argon2) vs. refresh-token (SHA-256) hashing strategies — they solve different problems (slow verification vs. deterministic lookup).
- Don't enable `LoggingOtpSender` in production — it logs OTP codes instead of sending them.
- Don't build POSTPONE-module logic (encounter-emr, reviews, fraud, analytics, family-accounts) — schema exists in `prisma/schema/postponed.prisma` for forward-compatibility only. `laboratory` is no longer POSTPONE — un-postponed 2026-09-02 (File 12 Part 47), has its own `prisma/schema/laboratory.prisma`, a full order lifecycle, and a connected dashboard (`medsuper-laboratory-dashboard`).
- Don't invent a business constant, folder layout, or library choice inline — check File 10/11 for the rule, File 12 for the pattern; if neither answers it, add the decision to File 12 first.
- Don't pre-integrate deferred vendors (payment gateway, secrets manager, WAF, virus scanning, cross-region backup, OpenTelemetry) before the phase that needs them.
- Don't namespace admin routes under `/admin` — use `@Roles(ADMIN)` instead.
- Don't let raw DB errors, stack traces, or file paths reach a client response — only `ErrorEnvelopeFilter` translates errors.
- Don't assume a `role_membership` "active" resolution beyond "first active membership" — multi-membership behavior is explicitly unresolved (Phase 2+).
- Don't fabricate Flutter/mobile architecture details for this repo — there is none here; it lives in a separate repo.

---

## 17. Project Glossary

| Term | Meaning |
|---|---|
| **MedSuper** | The overall healthcare booking/pharmacy platform product. |
| **File 10 / 11 / 12** | The three governing docs in `docs/`: 10 = open product decisions (`DEC-XXX`), 11 = backend/API/DB spec (source of truth for *what*), 12 = engineering decisions/conventions (source of truth for *how*). |
| **DEC-XXX / DEC-BXX** | A tracked decision ID from File 10/11 (`DEC-` = product-level, `DEC-B` = backend-engineering-level). `OPEN` = genuinely undecided. |
| **ADR-XXX** | An Architecture Decision Record for a cross-repo or engineering-level choice not covered by File 10/11 (e.g. ADR-005, provider self-registration); lives in File 12 as a pointer, full record may be in a sibling repo. |
| **Outbox / outbox event** | A row in `outbox_events` written in the same transaction as a business change, later drained by `OutboxWorker` to trigger async side effects (notifications, cross-module reactions). |
| **Hold** | A time-limited, exclusively-claimed reservation of an `appointment_slot` prior to payment/confirmation (`appointment_holds`, partial unique index enforces one `ACTIVE` hold per slot). |
| **First-accept-wins** | The pharmacy broadcast-order concurrency pattern: whichever branch's conditional update lands first claims the order; all others get `409 ORDER_ALREADY_CLAIMED`. |
| **Optimistic lock** | The `version` column + `updateWithOptimisticLock` pattern used instead of DB-level row locking for most updates; throws `OptimisticLockError` → `409 OPTIMISTIC_LOCK_CONFLICT` on a stale write. |
| **Envelope (success/error)** | The standard wrapper shape every `/v1` API response is normalized into — see §11. |
| **Correlation ID** | A per-request ID propagated via `AsyncLocalStorage`, present in every log line and error envelope, used to trace a request across the API and worker processes. |
| **POSTPONE module** | A domain module with a schema (`prisma/schema/postponed.prisma`) but explicitly no logic to be built without a new product decision: encounter-emr, reviews, fraud, analytics, family-accounts. (`laboratory` was in this list until it was un-postponed 2026-09-02, File 12 Part 47 — it is now a full MVP module with its own `prisma/schema/laboratory.prisma`.) |
| **Modular monolith** | This repo's architecture: one deployable API process + one worker process + one Postgres DB, with strict module boundaries designed to allow future extraction into real services. |
