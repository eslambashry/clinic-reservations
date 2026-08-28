# pharmacy-fulfillment

**MVP** — owns `PharmacyOrder`, `PharmacyOrderBroadcast`, `PharmacyOrderItem`, `Substitution` (see `prisma/schema/pharmacy.prisma`), per File 11 Part 03/14.

**Status:** scaffolded, not implemented. Engineering decisions are closed in `docs/FILE_12_Engineering_Decisions_And_Conventions.md` Part 39 (broadcast targeting via provider-directory's `SearchPharmacyBranchesUseCase`, broadcast-timeout worker cron, branch-scoped pharmacy-staff RBAC, payment-capture reuse, `OUT_FOR_DELIVERY` deferred to Phase 9) — `pharmacy-fulfillment.module.ts` is an empty shell, not yet registered in `AppModule`.

Planned build order (each its own pass, per Part 39.10):
1. Order creation from an `ACCEPTED` prescription + broadcast fan-out to nearby branches.
2. Broadcast accept/decline, with the first-accept-wins concurrency test (File 11 line 456).
3. Quote/substitution: pharmacist marks item availability, proposes substitutions, patient approves/rejects.
4. Payment-capture wiring (`ACCEPTED → PAID`, reusing `payments`' `CapturePayAtClinicPaymentUseCase`) and partial refund on substitution price reduction.
5. Broadcast-timeout worker cron and branch-scoped pharmacy-staff RBAC (also tightens Phase 6's currently-unscoped review queue, Part 37.4).
