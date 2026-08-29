# pharmacy-fulfillment

**MVP** — owns `PharmacyOrder`, `PharmacyOrderBroadcast`, `PharmacyOrderItem`, `Substitution` (see `prisma/schema/pharmacy.prisma`), per File 11 Part 03/14.

**Status:** order creation + broadcast fan-out, and broadcast accept/decline, implemented (`POST /v1/pharmacy-orders`, `.../accept`, `.../decline`). Engineering decisions are closed in `docs/FILE_12_Engineering_Decisions_And_Conventions.md` Part 39, including the branch-scoped pharmacy-staff RBAC lookup (`identity-auth`'s `GetActiveRoleMembershipUseCase`, Part 39.12) and the first-accept-wins concurrency mechanics (Part 39.13).

Planned build order (each its own pass, per Part 39.10):
1. ~~Order creation from an `ACCEPTED` prescription + broadcast fan-out to nearby branches.~~ Done.
2. ~~Broadcast accept/decline, with the first-accept-wins concurrency test (File 11 line 456).~~ Done.
3. Quote/substitution: pharmacist marks item availability, proposes substitutions, patient approves/rejects.
4. Payment-capture wiring (`ACCEPTED → PAID`, reusing `payments`' `CapturePayAtClinicPaymentUseCase`) and partial refund on substitution price reduction.
5. Broadcast-timeout worker cron (also tightens Phase 6's currently-unscoped pharmacist review queue, Part 37.4, once the branch-scoping lookup used here is applied there too).
