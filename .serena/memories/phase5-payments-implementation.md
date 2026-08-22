# Phase 5 — Payments Module (implemented, 2026-08-20)

Full implementation of the project's Phase 5 build-order item (`FILE_12` Part 10: "Payments,
pay-at-clinic only. Ledger mechanics; no gateway integration"). Not to be confused with
`[[performance-audit-phase5]]`, which is the unrelated generic-review-checklist "Phase 5"
(Performance Audit) from an earlier session.

Plan file (full rationale, file-by-file breakdown): `C:\Users\10\.claude\plans\composed-humming-lagoon.md`.
Decision record: `docs/FILE_12_Engineering_Decisions_And_Conventions.md` Part 36 (13 items).

## What shipped

- **New `src/shared/kernel/policy-config/`**: `PolicyConfigReader` (`@Global()` module, mirrors
  `PrismaModule`/`OutboxModule`) — read-only `policy_configs` access by region+type, takes an
  explicit `tx`. No write-side/Admin CRUD module exists yet (Part 36.1) — this is intentionally
  minimal.
- **New `src/shared/config/constants.ts` → `REGION_CONSTANTS.DEFAULT_REGION_CODE = 'EG'`** —
  `src/db/seed.ts` now imports this instead of its own local literal.
- **`src/db/seed.ts`** now also seeds `COMMISSION_RATE` (`{ ratePercent: 15 }`, region `EG`) —
  same idempotent read-then-conditional-create shape as the pre-existing `CANCELLATION_TIER`
  seed. Both are engineering placeholders, not spec-sourced numbers.
- **New `provider-directory` export**: `GetAffiliationBillingInfoUseCase` (third export
  alongside the existing two) — takes `tx` explicitly (unlike its siblings), returns
  `{ consultFee, currency, doctorId }` for an affiliation.
- **New `src/modules/payments/` module** (previously just a README stub): `domain/payment-money.rules.ts`
  (pure, cents-integer money math — commission split, cancellation fee split, proportional
  commission reversal), four repositories (`payment-intent`, `payment-split`, `refund`,
  `provider-ledger`), two exported use-cases —
  `CapturePayAtClinicPaymentUseCase` and `ProcessCancellationRefundUseCase` — **both take an
  explicit `Prisma.TransactionClient`** instead of opening their own transaction (the one
  deliberate deviation from every other exported cross-module use-case in this codebase,
  required so payment capture commits atomically with `appointments.status → CONFIRMED`,
  File 11 Part 11). No controller yet — no gateway means nothing external to expose this
  phase.
- **`scheduling-appointments` wiring**: `ConfirmAppointmentUseCase` now pre-generates the
  appointment's UUID (`randomUUID()`, breaks the `payment_intents.payable_id` ⇄
  `appointments.payment_intent_id` circular reference), reads billing info, captures a
  pay-at-clinic payment (`idempotencyKey: hold:${holdId}`), and sets `payment_intent_id` on
  create. `CancelAppointmentUseCase` now computes real `feeApplied`/`refundAmount` from the
  `CANCELLATION_TIER` policy against the captured amount — `PROVIDER_REQUEST` cancellations
  always get `feePercent: 0` (verbatim rule, `FILE_11` line 475). Appointments with no
  `payment_intent_id` still return `0`/`0` (backward-compat fallback, not an error).
- Ledger entry at capture is `COMMISSION_DEDUCTION`, not `EARNING` — pay-at-clinic means the
  provider already holds 100% of the cash, so the ledger only records what they owe the
  platform. Refunds write `Refund.status = 'COMPLETED'` immediately (no gateway leg to wait on).

## A real bug found and fixed during verification

`ConfirmAppointmentUseCase`/`CancelAppointmentUseCase`'s `$transaction` calls were hitting
Prisma's **default 5000ms interactive-transaction timeout** intermittently — the new payment-capture
logic added ~6 more sequential round trips inside the same transaction, and this dev environment's
real Postgres (Neon) latency (~500-600ms/round-trip observed) pushed worst-case total time close to
or past 5s. Manifested as flaky `expect(fulfilled).toHaveLength(1)` failures in
`appointment-hold-concurrency.integration.spec.ts` (0 fulfilled instead of 1) — not a logic bug,
a timing margin. Fixed by passing `{ timeout: 15000 }` explicitly to both `$transaction` calls.
Documented in Part 36 item 13. If either transaction grows further, revisit this number.

## Pre-existing issues found (unrelated to Payments, left as-is)

- **Live Neon dev DB was missing 6 already-committed migrations** (including the one adding
  `users.first_name`/`last_name`) — applied via `npx prisma migrate deploy` with user
  confirmation (was blocking one integration test with an unrelated "column does not exist"
  error). Also ran `npm run db:generate` afterward.
- **PostGIS extension not enabled on this Neon DB** — `doctor-search.repository.integration.spec.ts`'s
  two radius/distance tests fail with `st_makepoint does not exist`. Pre-existing, not touched —
  would need `CREATE EXTENSION postgis;` run against the DB, out of scope for Payments.

## Verification status

`npm run build` clean, `npm run lint` clean, full `npm test` clean except the two pre-existing
PostGIS failures above. New/updated spec files: `payments/domain/payment-money.rules.spec.ts`,
`payments/application/capture-pay-at-clinic-payment.use-case.spec.ts`,
`payments/application/process-cancellation-refund.use-case.spec.ts`,
`provider-directory/application/get-affiliation-billing-info.use-case.spec.ts`,
`confirm-appointment.use-case.spec.ts` (updated), `cancel-appointment.use-case.spec.ts` (updated),
`appointment-hold-concurrency.integration.spec.ts` (updated: new provider wiring, new expected
cancel fee/refund numbers, cleanup for the new payments-side rows, `20000ms` per-test timeouts).

## Out of scope this phase (intentionally not built)

Real gateway integration (`DEC-001`), tax line item (`DEC-010`), tiered/hour-based cancellation
windows, `settlements` table/settlement-batch cron (still `OPEN` per Part 07), pharmacy-order
payments (pharmacy-fulfillment module doesn't exist yet), the client-facing `Idempotency-Key`
HTTP header (not wired to any endpoint anywhere in the codebase yet, not just payments).
