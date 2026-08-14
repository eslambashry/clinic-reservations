# FILE 12 — Engineering Decisions & Build Conventions
**Version:** v1.0
**Depends on:** `FILE_11_Backend_API_Database_Engineering_Specification.md` (architecture/API/DB authority) · `FILE_10_Implementation_Readiness_Open_Decisions.md` (product `DEC-XXX` authority)
**Convention used throughout:** same as File 11 — `REF` = already decided upstream, cited not repeated. `DECIDED` = resolved in *this* document, with rationale, because File 10/11 explicitly delegated the choice to engineering. `OPEN` = still genuinely undecided, not to be silently filled in. `DEFERRED` = decided to not build yet, tied to a roadmap phase.

## PART 01 — Purpose

File 11 specifies *what* the backend must do (architecture, API contract, schema, transactional rules). It deliberately stops short of engineering-level implementation choices (framework, libraries, folder layout) — several of these are named explicitly as blocking and unresolved (Part 29, `DEC-B01`, `DEC-B04`...).

This file resolves everything needed to start writing code **without inventing anything mid-task**. Every future prompt/task in this repo should:
1. Check File 10/11 for the *business rule or contract*.
2. Check this file for the *engineering pattern* (which library, which folder, which convention).
3. Only if neither answers the question, treat it as a genuinely new decision — add it here with rationale before writing code that depends on it, rather than deciding it silently inside an unrelated diff.

Nothing in this file overrides File 10/11. Where this file states a concrete value for something File 11 left as an `OPEN DECISION` with no product impact (e.g. exact TTLs), it is adopting File 11's own stated recommended default — not inventing a new number.

---

## PART 02 — Runtime & Framework (resolves `DEC-B01`)

| Item | Decision |
|---|---|
| Language | TypeScript, strict mode (already set in `tsconfig.json`) |
| Runtime | Node.js 20 LTS |
| HTTP framework | **NestJS 10** — confirmed with Tech Lead (this document), resolving `DEC-B01` |
| ORM | Prisma (already in use — `package.json`, `prisma/schema/*`) |
| Package manager | npm (`package-lock.json` is the committed lockfile; delete the stray untracked `pnpm-lock.yaml` rather than maintaining two) |

**Why NestJS, not Fastify/Express (rationale, for anyone revisiting this):** File 11 Part 02.2/02.3 requires (a) a strict layered architecture, (b) module boundaries that are enforced not just documented, (c) cross-cutting concerns implemented once and applied everywhere via a central mechanism, not copy-pasted per route. Nest's primitives map onto these requirements directly instead of needing custom infrastructure built to simulate them:

| File 11 requirement | Nest primitive |
|---|---|
| Auth/RBAC middleware (Part 02.3) | `Guard` |
| Correlation-ID propagation (Part 02.3) | `Middleware` + request-scoped context |
| Error-envelope normalization (Part 02.3, Part 06) | Global `ExceptionFilter` |
| Idempotency-key handling (Part 02.3, Part 11) | `Interceptor` |
| Input validation, allowlist-only (Part 04) | Global `ValidationPipe` (`whitelist: true, forbidNonWhitelisted: true`) |
| Module boundaries, no cross-module table reach (Part 01/02.1) | Nest `Module` encapsulation — a module only exports what it intends other modules to call |
| Two processes sharing domain logic (API + worker, Part 02.1) | Two Nest application contexts (`NestFactory.create` for API, `NestFactory.createApplicationContext` for worker) bootstrapping the *same* `AppModule` — business logic is written once, not duplicated between processes |

---

## PART 03 — Infrastructure already decided (evidence in repo, not re-decided here)

| Component | Value | Evidence |
|---|---|---|
| Database | Neon Postgres (pooled `DATABASE_URL` + direct `DIRECT_URL`) | `src/db/client.ts` comment, `package.json` keywords |
| Cache/session/queue backing | Redis | `package.json` keywords, `docker-compose.yml` present |
| Object storage, payment gateway, secrets manager, WAF | **OPEN** — untouched, per File 11 `DEC-001`/`DEC-B02`/`DEC-B03` and File 10 `DEC-009`. Not needed until the phase that requires them (Part 10 below) — do not pre-integrate a vendor speculatively. |

---

## PART 04 — Library/tooling stack (`DECIDED`, each tied to a File 11 requirement)

| Concern | Choice | Why this one |
|---|---|---|
| Validation | `class-validator` + `class-transformer` | Native to Nest's `ValidationPipe`/DTO pattern — zero adapter glue. Decorator-based DTOs double as the input contract and (with `@nestjs/swagger`) the OpenAPI schema, so the contract is written once. |
| Structured logging | `pino` via `nestjs-pino` | Satisfies Part 24 (JSON logs, correlation ID on every line) with a maintained Nest integration instead of hand-wrapping a logger; `nestjs-pino` auto-attaches request-scoped fields. |
| Correlation ID propagation | Node's built-in `AsyncLocalStorage`, wrapped in one `RequestContextService` (`src/shared/core/context/`) | The requirement (Part 02.3: thread an ID through logging/errors/downstream calls without passing it as a manual parameter everywhere) is exactly what `AsyncLocalStorage` is for. A ~20-line wrapper is enough — not worth an extra dependency for something the runtime already solves. |
| Access tokens | `@nestjs/jwt` | Short-lived JWT carrying `userId` + active role-membership context (File 11 07.1) — standard, no need for Passport's strategy abstraction since there is exactly one token-verification path, not multiple login strategies. |
| Refresh tokens | Node `crypto.randomBytes` (opaque token) + **SHA-256** hash for storage/lookup | File 11 07.1 requires refresh tokens to be **opaque, not JWT**, stored hashed, rotated on every use. SHA-256, not argon2: `/token/refresh` and `/logout` present only the raw token with no other lookup key, so the row must be found by `WHERE token_hash = ?` — argon2 salts every hash differently, so re-hashing the presented token would never equal the stored hash, making equality lookup impossible. SHA-256 is deterministic and safe here specifically because the token itself is a 48-byte crypto-random value (384 bits of entropy) — brute-forcing it is infeasible regardless of hash speed, unlike a 6-digit OTP code. |
| OTP codes | `argon2` hash (`otp_requests.code_hash`) | Looked up by `otp_requests.id` (from the request), then verified with `argon2.verify(hash, candidate)` — no equality-lookup-by-hash needed, so argon2's slow, salted verification (OWASP-recommended over bcrypt) is the right choice where it matters: a 6-digit code is low-entropy and must resist brute force. |
| Rate limiting | `@nestjs/throttler` | Implements Part 04's per-user/per-IP limiting with per-endpoint overrides via decorator — pragmatic sliding-window implementation of the "token-bucket" requirement; exact enforcement algorithm is an implementation detail, the per-endpoint configurability is what Part 04 actually requires. |
| Redis client | `ioredis` | De facto standard, cluster-ready, typed. |
| Scheduled jobs (hold-expiry sweep, no-show sweep, prescription-upload cleanup, settlement batch — Part 27) | `@nestjs/schedule` (`@Cron`), running inside the **worker** application context only, never the API process | Keeps cron logic declarative and colocated with the domain module it belongs to (e.g. the hold-expiry sweep lives in `scheduling-appointments`, not a generic "jobs" dumping ground). |
| Outbox worker (Part 20) | Hand-written polling loop against `outbox_events` using `SELECT ... FOR UPDATE SKIP LOCKED` (Prisma `$transaction` + `$queryRaw` for the locking read, ORM for the update) | Part 20 already specifies the exact mechanism (an `outbox_events` table drained by a worker) — introducing a second queue library (e.g. pg-boss/BullMQ) on top would be an unrequested extra moving part. `SKIP LOCKED` is the standard Postgres pattern for exactly this and needs no library. |
| Testing | `Jest` + `@nestjs/testing` (`TestingModule`) for unit/integration, `supertest` (via Nest's own e2e testing utilities) for API/contract tests | Nest's own tooling and documentation are Jest-first; deviating adds friction for no benefit at this project's scale. Matches File 11 Part 26's test-type breakdown (unit / integration / API-contract / concurrency / E2E). |
| API documentation | `@nestjs/swagger`, generated from the same `class-validator` DTOs | One source of truth for the contract instead of hand-maintained docs drifting from the code. |
| IANA timezone math (Phase 3, Part 33.4) | `luxon` | First need for real timezone-aware local-time math (a schedule template's `"HH:mm"` + a branch's `iana_timezone` → a correct, DST-safe UTC instant, File 11 Part 12). Better-typed, immutable API than hand-rolling with the native `Date`/`Intl` objects, and lighter than `moment-timezone` (unmaintained) for a single, well-scoped conversion need. |

---

## PART 05 — Canonical module structure

Every domain module under `src/modules/<name>/` follows File 11 Part 02.2's four layers exactly, as Nest sub-folders:

```
src/modules/<name>/
  api/
    <name>.controller.ts       # routing only — delegates to application layer, no business logic
    dto/                       # class-validator request/response DTOs
  application/
    *.use-case.ts              # one class per use-case; orchestrates domain + repositories; owns the transaction boundary
  domain/
    *.entity.ts / *.rules.ts   # business rules, state machines (e.g. AppointmentStateMachine) — no Prisma/HTTP imports here
  infrastructure/
    *.repository.ts            # Prisma-backed persistence, implements a domain-defined interface
  <name>.module.ts              # wires the above; explicitly declares what it exports for other modules to call
```

**Rules that make the module boundary real, not just organizational:**
- A module may only be called by another module through its exported **application-layer service**, injected via Nest DI — never by importing another module's `infrastructure/` repository or Prisma model directly. This is the concrete mechanism for File 11 Part 01's "cross-module reads happen through an internal service call, not a join."
- The `domain/` layer never imports from `api/` or from `@nestjs/*` — it must stay framework-agnostic business logic, testable without Nest or Postgres running (Part 02.2's "dependency direction is strictly downward").
- Cross-cutting infrastructure (Prisma client, Redis client) lives in `src/shared/kernel/` as Nest providers, injected into repositories — never instantiated ad hoc inside a module.

Shared/central code:
```
src/shared/
  core/
    auth/          # RbacGuard, JwtAuthGuard, @CurrentUser() decorator, @Roles() decorator
    context/       # RequestContextService (AsyncLocalStorage-based correlation ID)
    errors/        # domain exception classes + global ErrorEnvelopeFilter (Part 06 shape)
    idempotency/   # IdempotencyInterceptor
    logging/       # LoggingModule (nestjs-pino config)
    middleware/    # CorrelationIdMiddleware
    outbox/         # OutboxService.emit() (writes within the caller's transaction) + OutboxWorker (Part 20)
  kernel/
    prisma/        # PrismaService (Nest-wrapped src/db/client.ts), transaction helper
    redis/         # RedisModule/RedisService
  config/           # typed config module (env parsing + the constants registry, Part 08)
```

---

## PART 06 — Process topology

Two entrypoints, one codebase, per File 11 Part 02.1's "modular monolith + worker" decision:

- `src/main.ts` — HTTP API process. Bootstraps `AppModule` with `NestFactory.create`, registers global pipe/filter/interceptors, listens on a port.
- `src/worker.ts` — background process. Bootstraps the **same** `AppModule` with `NestFactory.createApplicationContext` (no HTTP listener), then starts the outbox drain loop and `@nestjs/schedule` cron jobs.

Domain/application/infrastructure code is identical either way — only the entrypoint differs. This is what prevents the "two processes" requirement from turning into two parallel implementations of the same business logic.

---

## PART 07 — Cross-cutting implementation notes

- **Success response shape:** File 11 Part 06 only specifies the *error* envelope (`{ success: false, error: {...} }`). For consistency, successful responses use the mirrored shape `{ success: true, data: <payload>, requestId, correlationId }` via a global `ResponseInterceptor`. This is an inferred convention (not explicitly in File 11) — flagged here so it's a documented, deliberate choice rather than something reinvented per-controller.
- **`outbox_events` schema:** Part 20 names the table and its core columns (`id, event_name, payload jsonb, created_at, processed_at nullable`) but its own retry/dead-letter prose implies more. Adding, consistent with every other table's conventions (Part 08 of File 11): `status enum(PENDING, PROCESSING, PROCESSED, FAILED)`, `attempts int default 0`, `last_error text?`, `updated_at`, `version`. This table is added to `prisma/schema/shared.prisma` at Phase 0 (foundation), even though nothing consumes it until Phase 8 (Notifications) — so early modules (Identity, Appointments) have somewhere to write events from day one instead of that plumbing being retrofitted later.
- **`settlements` table:** referenced by name in File 11 Part 03/13 (renamed from `payout_batches`) but never given a column spec anywhere in File 10/11. **OPEN** — do not invent its schema now; design it when Phase 5 (Payments) actually reaches settlement batching, grounded in Part 13's description at that time.
- **RBAC guard:** reads the JWT's active `role_membership` context claim (File 11 07.1) and checks it against a `@Roles(...)` / `@Permissions(...)` decorator on the route — never a manual `if (user.role === ...)` check inline in a controller or use-case. Authorization rules belong in one place (Part 07.2's matrix) so they can be audited as a set, not scattered per-endpoint.
- **Audit logging:** written inside the *same* Prisma transaction as the business state change (File 11 Part 03's `audit` row, "never async-only"), via an `AuditService` called from the application-layer use-case — never from the outbox (the outbox is for async side effects like notifications, not the audit record itself, which must be synchronous and transactional).

---

## PART 08 — Config & constants registry

Single source (`src/shared/config/`), env-overridable, defaulting to File 11 Part 29's own stated recommendations — no magic numbers scattered through business logic:

| Constant | Default | Source |
|---|---|---|
| Access token TTL | 30 min | File 11 `DEC-B08` recommended default |
| Refresh token TTL | 30 days | File 11 `DEC-B08` recommended default |
| Appointment hold TTL | 5 min | File 11 Part 12 (already stated as decided, matches Flutter doc) |
| No-show grace period | 15 min | File 11 Part 12 / `DEC-B11` recommended default |
| Cancellation fee | Read from `policy_configs` at request time | Never hardcoded — File 11 Part 12 explicitly requires server-side computation from policy config, not a constant |
| Rate limits | Conservative per-endpoint defaults (documented next to each controller's `@Throttle()`), revisited from real traffic | `DEC-B09` — explicitly delegated to engineering discretion with instruction to "start conservative, tune from real traffic"; not a product decision to seek approval for, but each value must be logged here when set, not buried in a decorator with no explanation |

---

## PART 09 — Naming & response conventions

- Follows File 11 Part 08 exactly for DB naming (`snake_case`, `<table>_<column>_enum`) — already reflected in `prisma/schema/*`.
- REST resources/routes: plural nouns, `kebab-case` where multi-word (`/v1/pharmacy-orders`), matching File 11 Part 05's contract.
- DTO fields: `camelCase` in the API layer (JSON convention), mapped to `snake_case` Prisma models at the repository boundary — the mapping happens once, in `infrastructure/`, never leaks either convention into the wrong layer.
- HTTP status/error codes: exactly File 11 Part 06's table — new error codes must follow the same `SCREAMING_SNAKE_CASE` pattern and be added to that table's spirit (categorized under Authentication/Authorization/Validation/Conflict/etc.), not invented ad hoc per endpoint.

---

## PART 10 — Build order (task checklist for future prompts)

Mirrors File 11 Part 28 + "Backend Engineering Starting Point" — use this as the literal task order unless the user directs otherwise:

1. **Phase 0 — Foundation.** Install NestJS + Part 04's libraries; scaffold `src/main.ts`/`src/worker.ts`/`AppModule`; implement `shared/core/*` and `shared/kernel/*` for real (replacing today's stub files); add `outbox_events` to the schema; health-check endpoint. *No product/business logic yet.*
2. **Phase 1 — Identity & Auth.** OTP request/verify, token issuance/rotation/refresh, `role_memberships`. Exit: a client can authenticate end-to-end.
3. **Phase 2 — Provider Directory.** Directory CRUD + manual verification. Exit: Admin can verify a seeded doctor.
4. **Phase 3 — Availability.** Schedule templates + slot generation job. Exit: real, correctly-timezoned slots via `GET /doctors/{id}/slots`.
5. **Phase 4 — Appointments.** Hold/confirm/cancel/reschedule + concurrency tests written alongside, not after (File 11 Part 26 requires this explicitly).
6. **Phase 5 — Payments (pay-at-clinic only).** Ledger mechanics; no gateway integration (`DEC-001` stays open).
7. **Phase 6 — Prescriptions.** Upload, quality-check gate, pharmacist review — the OCR-never-trusted-alone rule (File 10 §7.3) must be enforced by a real DB constraint/check, not just application-layer discipline.
8. **Phase 7 — Pharmacy Fulfillment.** Broadcast/quote/substitution/order lifecycle, first-accept-wins concurrency test.
9. **Phase 8 — Notifications.** Outbox worker goes live for real; tier routing; `SAFETY_CRITICAL` non-disableable rule enforced.
10. **Phase 9 — Delivery (MVP-lite).** Manual status tracking only.
11. **Phases 10–12 — hardening/testing/production readiness**, per File 11 Part 28 — not started until 1–9 are functionally complete.

Each phase's exit criteria (File 11 Part 28's table) is the Definition of Done — a phase isn't "next" material until the previous one's exit criterion is actually met, not just coded.

---

## PART 11 — Explicitly deferred (do not build without a new explicit go-ahead)

Everything File 11 Part 03 marks **POSTPONE** (Encounter/EMR, Reviews, Fraud automation, Analytics, Family Accounts, Laboratory) — schema stays as-is in `prisma/schema/postponed.prisma`, no controllers/use-cases/services. Also deferred, per their own File 11 status: payment gateway integration (`DEC-001`), object storage vendor (Part 19, needed starting Phase 6), secrets manager (`DEC-B02`), WAF (`DEC-B03`), virus scanning on uploads (`DEC-B07`), cross-region backup (`DEC-B06`), read replicas/partitioning (Part 08), OpenTelemetry tracing (reasonable per Part 24 but not before Phase 10 hardening — no need to pay that complexity cost during Phase 0–9 feature building).

---

## PART 12 — Operating rules for generating code against this file

- Every new business constant (a fee, a TTL, a grace period, a limit) must either come from `policy_configs` (if it's something Admin can tune) or be added to Part 08's registry with its source cited — never a bare literal inside a use-case.
- Every new module must follow Part 05's structure exactly; deviating (e.g. putting Prisma calls in a controller) is a defect, not a style preference.
- Before implementing anything not explicitly covered by File 10/11/this file, stop and add the decision here first (with rationale) rather than deciding it inline as a side effect of an unrelated task.
- Don't build ahead of the Part 10 order — e.g. don't wire real payment-gateway calls while still in Phase 5, don't add Lab/Reviews code because a table already exists for them.

---

## PART 32 — Phase 2 (Provider Directory) Decisions

Resolved per this Part 12's own operating rule — File 10/11 specify the business rules (manual verification, invisible-until-`VERIFIED`, Postgres+PostGIS search) but leave the following implementation gaps, closed here before Phase 2 code was written:

1. **Display name / photo storage.** No source doc defines where a person's display name lives — `users` has only `phone`/`email`; `doctors` has no name column — yet File 11 05.2 (`GET /v1/patients/me`) and 05.4 (`GET /v1/doctors/search`) both require returning one. **Decided:** `users.first_name`/`users.last_name` (nullable — OTP-only signup collects no name), `doctors.photo_url` (nullable). Name lives on the person (`User`), not duplicated per role, so it's reusable once Patient profile (05.2) is built.
2. **Verification scope = top-level entities only, not branches.** `provider_verification_documents.provider_type` (`ProviderType` enum) is `{DOCTOR, CLINIC, PHARMACY, LAB}` — no branch variants exist in that enum. This is read as confirming the document-review/verify/suspend pipeline (File 11 07.3) targets `Doctor`/`Clinic`/`Pharmacy` only. `ClinicBranch`/`PharmacyBranch.status` are simpler Admin-toggled operational flags with no document requirement — a branch is a location of an already-KYC'd legal entity, not separately vetted. `ProviderVerified` (File 11 Part 03's stated emit) fires only for `DOCTOR`/`CLINIC`/`PHARMACY` verify actions, never for branches.
3. **Document approval and provider verification are independent actions.** Approving a `ProviderVerificationDocument` does not auto-flip the parent provider to `VERIFIED` — no source doc states that coupling, and a reviewer may require multiple documents before verifying. Admin calls `/verify` explicitly, separately.
4. **Admin CRUD surface, no `/admin` URL prefix.** File 11 never namespaces admin routes under `/admin` (e.g. `PATCH /v1/clinic-branches/{id}/appointments` is bare) — authorization is via `@Roles(ADMIN)`, not the URL. Since provider self-service/onboarding UI doesn't exist (File 11 07.1: providers are Admin-provisioned) and the Provider Web Dashboard is out of scope for this phase, the full create/update/verify/suspend surface is Admin-only, no separate provider-facing write path. **Amended by ADR-005 (see Part 34):** update/verify/suspend remain Admin-only exactly as decided here; a separate, narrower authenticated **intake** endpoint was added afterward so a non-Admin user can submit a PENDING application, still requiring the same Admin `verify` step before anything becomes visible.
5. **Doctor/Clinic/Pharmacy creation requires an existing `userId`/no cross-module user provisioning.** Creating a `Doctor` takes `userId` (must already exist). An invalid FK surfaces as Prisma's foreign-key violation (P2003), translated to a domain error — no cross-module call into identity-auth is needed for this validation, so no module boundary is crossed. Provisioning a brand-new `User` for someone who has never authenticated is out of scope.
6. **No `role_membership` is granted when a Doctor/Clinic/Pharmacy record is created.** File 11 07.1's "Admin-approved role_membership" is what lets that person's phone log in *as* that provider (Provider Web Dashboard) — out of scope here. `Doctor.user_id` only anchors identity for display/audit, not login authorization — same category of gap identity-auth's own `verify-otp.use-case.ts`/`refresh-token.use-case.ts` already flag inline ("which membership is active" once a user can have more than one), not resolved here either.
7. **Verification document upload accepts a pre-hosted `fileUrl`, no file upload.** Object storage vendor is `OPEN`/deferred (Part 11 above: "not needed until the phase that requires them"). `fileUrl` is a plain string field — multipart upload is a future Part 19 concern.
8. **No new `Permission` codes for this module.** Every write/verify/suspend action requires only `@Roles(ADMIN)` — File 11 07.3 states verification is "performed only by Admin" with no finer-grained distinction anywhere in File 10/11/this file. `@Permissions()` codes with no documented distinct grantee would be premature.
9. **`@OptionalAuth()` — new shared/core primitive.** File 10's contract for `GET /v1/doctors/search` states "Auth: optional (public search allowed)" — `JwtAuthGuard` previously only supported fully-public (`@Public()`, never decodes a token) or fully-required. Neither lets an Admin token unlock full detail on an otherwise-public route (needed so Admin can review a `PENDING` doctor via the same `GET /v1/doctors/{id}` used for public detail). Added: `src/shared/core/auth/optional-auth.decorator.ts` + a guard branch in `jwt-auth.guard.ts` — if a bearer token is present it's verified and attached; if absent, the request proceeds unauthenticated (never throws). Small, additive, backward-compatible with every existing route.
10. **Search query params extend File 10's documented set with one addition: `q` (free-text).** File 11 Part 22 names `pg_trgm` trigram name/specialty matching as part of the search approach, but File 10's documented param list (`specialty, lat, lng, radiusKm, date, sort, cursor, limit`) has no field to carry a search string. Adding `q` is additive (File 11 Part 04: "additive changes never bump version").
11. **`date` search param is accepted but not yet honored** — filtering to "doctors with availability that day" requires `appointment_slots`, which doesn't exist until Phase 3. Documented explicitly in code, not silently ignored.
12. **`nextAvailableSlot` in search results is always `null`** for the same Phase-3-dependency reason. Response shape matches File 10 exactly; the field just isn't populated yet.
13. **No status-transition state machine for verify/suspend.** `DoctorStatus`/`ProviderStatus` have no documented transition table (unlike `AppointmentStatus`). Verify/suspend set the target status directly regardless of prior state (idempotent-safe — re-verifying an already-`VERIFIED` doctor is a no-op success), guarded only by optimistic locking (`version`) for concurrent-write safety.
14. **No concurrency-race test suite for this phase.** File 11 Part 26 mandates concurrency tests specifically for the appointment-hold and pharmacy-broadcast-accept paths (Part 11's table) — verify/suspend isn't a named concurrency-critical path. Optimistic locking is applied for correctness; no N-simultaneous-requests test is built.
15. **`AuditService` built now, in the `audit` module** (previously just a schema/README stub). File 12 Part 07 requires verification actions to be audit-logged in the same transaction as the state change — this is the first phase that needs it. One `record(tx, params)` method, exported from `AuditModule`, auto-filling `correlation_id` from `RequestContextService`.
16. **Cursor pagination gets one shared helper**, `src/shared/core/pagination/cursor.util.ts` (`encodeCursor`/`decodeCursor`, opaque base64 JSON) — first module needing pagination (File 10 §2.2's base API convention); implemented once so later modules reuse it.
17. **Local Postgres+PostGIS+Redis via Docker for dev.** `docker-compose.yml` was an empty placeholder and no `.env` existed. A real compose file (`postgis/postgis` + `redis`) plus a local `.env` were added so migrations/seed/tests/Swagger can be run and verified without touching a real Neon instance.

---

## PART 33 — Phase 3 (Availability) Decisions

File 11 Part 12 specifies the business behavior (weekday+time-range templates, buffer time, UTC storage via branch `iana_timezone`, rolling-window materialization) and File 10 §2.3 specifies the one consumer-facing contract this phase serves, `GET /v1/doctors/{doctorId}/slots`. Neither doc specifies how a schedule template gets created, or several other implementation gaps — closed here before Phase 3 code was written, mirroring Part 32's process.

1. **Schedule template CRUD is a new, undocumented Admin surface** (no endpoint named in File 11 05.x — the same gap Phase 2 hit for provider CRUD). Decided the same way: full Admin-only CRUD (`@Roles(ADMIN)`, no `/admin` prefix), since provider self-service (a doctor/clinic managing their own schedule) requires the Provider Web Dashboard + a `role_membership` for `DOCTOR`/`CLINIC_STAFF`, both out of scope until that phase.
2. **Route shape:** flat `@Controller('schedule-templates')` (`POST /v1/schedule-templates` with `doctorClinicAffiliationId` in the body, `GET /v1/schedule-templates?affiliationId=`, `PATCH /v1/schedule-templates/{id}`, `DELETE /v1/schedule-templates/{id}`) — mirrors the existing flat `AffiliationsController` (`affiliations/:affiliationId`) rather than nesting under `affiliations/{id}/...`.
3. **Cross-module read path — the first real instance of the pattern `provider-directory`'s own module doc comment predicted.** `ScheduleTemplate`/`AppointmentSlot` belong to `scheduling-appointments`; resolving a `doctorId`+`clinicBranchId` pair to an affiliation, and checking Part 32's visibility chain (doctor/affiliation/branch/clinic), is `provider-directory`'s data. Per Part 05's "no cross-module joins — call through the exported application-layer service" rule: `ProviderDirectoryModule` gets an `exports: []` array for the first time (it previously had none, despite its own doc comment stating scheduling would call through it), exporting exactly two new use-cases and nothing else — `ResolveAffiliationForSchedulingUseCase` (doctorId+clinicBranchId → affiliationId, 404 under the same `isDoctorVisibleViaAffiliation`/`canBypassVisibility` rules `GetDoctorUseCase` already uses) and `ListSchedulableAffiliationsUseCase` (batch visibility filter + branch timezone, used by the generation job). `SchedulingAppointmentsModule` imports `ProviderDirectoryModule` and injects only these two use-cases — never `provider-directory`'s repositories.
4. **Timezone library: `luxon`** (+ `@types/luxon`) — first time this repo needs real IANA-timezone-aware local-time math (converting a template's `"HH:mm"` + branch `iana_timezone` into a correct UTC instant, DST-safe). Added to Part 04's stack table.
5. **`ScheduleTemplate.weekday` uses ISO-8601 numbering (1=Monday…7=Sunday)**, not JS's `Date.getDay()` (0=Sunday) — `luxon`'s own `DateTime.weekday` is already ISO-numbered, so the generation algorithm needs no conversion. Documented explicitly since neither File 10 nor File 11 specifies a convention and the column is a bare `Int`.
6. **`start_time`/`end_time` are `"HH:mm"` 24-hour strings** (the schema types them as plain `String`, not `DateTime` — wall-clock-only, timezone-free until combined with the branch's `iana_timezone` at generation time). Validated via `class-validator @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)`; `endTime` must be lexically (== chronologically, given the zero-padded format) after `startTime`, checked in the use-case as a `BusinessRuleError` (422).
7. **Slot slicing drops a trailing partial slot.** If `(end_time - start_time)` isn't evenly divisible by `slot_duration_minutes + buffer_minutes`, the remainder is dropped rather than generating an undersized slot.
8. **Idempotent, additive-only generation.** `AppointmentSlot` gets `@@unique([doctor_clinic_affiliation_id, start_at])` (was a non-unique `@@index` on the same columns) so a re-run uses `createMany({ skipDuplicates: true })` instead of a pre-query-then-diff. Generation never deletes/cancels a previously-materialized slot: editing or deleting a `ScheduleTemplate` is **not retroactive** — there is intentionally no FK from `AppointmentSlot` back to the template that produced it, so a template change only affects *future* generation runs. This is an accepted limitation of the given schema, not an oversight; slot cancellation logic belongs to Phase 4 regardless.
9. **Rolling window = 30 days** (File 11 Part 12's own "e.g., next 30 days"), added as `SCHEDULING_CONSTANTS.SLOT_GENERATION_WINDOW_DAYS` in `src/shared/config/constants.ts`. Window start = current UTC date (server clock), not per-branch-timezone-adjusted "today" — an accepted simplification.
10. **Generation job placement follows Part 04's own stated example almost verbatim** ("the hold-expiry sweep lives in `scheduling-appointments`, not a generic jobs dumping ground"): a thin `SlotGenerationJob` (`@Cron()`, `infrastructure/slot-generation.job.ts`) lives inside `scheduling-appointments` itself as a normal provider in `SchedulingAppointmentsModule` — **not** added to `WorkerModule` like `OutboxWorker`. It's technically instantiated in the API process too (since `AppModule` is shared), but its `@Cron` metadata is inert there because `ScheduleModule.forRoot()` is only imported by `WorkerModule` — `@nestjs/schedule`'s discovery scans the whole app graph, so registration only actually happens once, in the worker process. The real logic lives in `GenerateSlotsUseCase` (plain injectable, directly callable from tests without waiting on a real cron tick).
11. **No manual "run now" HTTP trigger endpoint.** Not documented anywhere; tests/verification call `GenerateSlotsUseCase.execute()` directly via Nest's testing module.
12. **Per-affiliation failure isolation, no outbox event.** The job loops per schedulable affiliation and catches/logs individually (mirrors `OutboxWorker.processOne`'s isolation). Slot generation is a system batch job, not a named Part 20 event producer (`AppointmentHeld/Confirmed/...` are the documented Scheduling events, all Phase 4) — no `outbox_events` row, no `AuditService` call (no human actor).
13. **All Admin-mutating schedule-template actions (create/update/delete) call `AuditService.record`** in the same transaction as the write — matches the universal pattern already used by every Phase 2 write use-case.
14. **No overlap validation between templates** (e.g. two rows both covering Monday 9–12 for the same affiliation) — harmless given decision #8's `skipDuplicates`.
15. **`GET /v1/doctors/{doctorId}/slots` is `@OptionalAuth()`**, same pattern as Phase 2's doctor search/detail — an Admin token bypasses the visibility gate, everyone else gets `404` if the doctor/affiliation isn't currently visible (never reveal existence, File 11 07.2).
16. **`from`/`to` query params on the slots endpoint are optional**, defaulting to `[today, today+14days)` when omitted (File 10's own stated cap is "max 14-day window per request"); if both are supplied, reject (`400 INVALID_DATE_RANGE` via the `DomainError` escape hatch) when `to <= from` or the span exceeds 14 days.

---

## PART 34 — Provider Self-Registration Intake (ADR-005)

Not a File 10/11 requirement — a cross-repo contract decision, made after the Flutter frontend was found already calling an invented `POST /v1/provider/registration` with no backend counterpart (`med-super/docs/backend_frontend_parity_matrix.md`). Full context, options considered, and the complete field-by-field mapping live in `docs/decisions/ADR-005-PROVIDER-SELF-REGISTRATION.md` (`MedSuper_Docs_Reorganization/docs/decisions/`) — this entry is a pointer, not a duplicate.

1. **New authenticated (any role), non-Admin intake surface** in `provider-directory`: `POST /provider/registration` creates the same `Clinic`/`Address`/`ClinicBranch`/`Doctor`/`DoctorClinicAffiliation` rows an Admin would, all starting `PENDING`, attributed to the caller (`Doctor.user_id` forced server-side from `@CurrentUser()`, never client-supplied). Does **not** grant any role membership (Part 32 item 6 still holds) and does **not** touch verification/visibility (Part 32 items 2–3 still hold — an Admin must still explicitly `verify`).
2. **`GET /provider/registration/lookups`** proxies the real `Specialty` table into `{id,label}` pairs; returns an empty `cities` array — no cities/regions reference table exists, and this decision does not invent one.
3. **DTO property names are `snake_case`, a deliberate, scoped exception to Part 09's `camelCase` API-layer convention** — matching the request body the frontend already ships (`full_name`, `specialty_label`, `photo_data_uri`, etc.) rather than forcing a frontend rewrite for a contract that was the entire point of this decision to preserve.
4. **Response includes `not_persisted: string[]`.** Several frontend-collected fields (`full_name`, `email`, `degree`, `bio`, `experience_years`, `photo_data_uri`, `documents`, `working_days`) have no home yet (no schema column, no upload flow, or the owning surface — schedule templates, verification documents — stays Admin-only per Parts 32–33). The DTO accepts them (so `forbidNonWhitelisted` doesn't reject the frontend's existing payload) but the use-case never persists them; naming them back in the response keeps this an explicit, visible contract gap instead of a silent drop.
5. **Two fields the frontend does not currently collect are required by the DTO anyway**, because the columns they map to are non-nullable: `license_number` (→ `Doctor.license_number`) and `region_code` (→ `Address.region_code`, since `city`/`city_label` are free text with no region derivation). Submission fails validation until the frontend adds both — not defaulted/fabricated.
6. **`phone` → `ClinicBranch.phone`** is a judgment call, not a confirmed product decision (the doctor's own phone is already known from `User.phone`) — flagged in the ADR for product/frontend confirmation.
17. **No `BLOCKED`-slot / doctor-leave management in this phase.** `SlotStatus` has a `BLOCKED` value but Part 10's Phase 3 description is scoped to "schedule templates + slot generation job" only.
