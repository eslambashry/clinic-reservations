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
