# pharmacy-fulfillment

**MVP** — owns `PharmacyOrder`, `PharmacyOrderBroadcast`, `PharmacyOrderItem`, `Substitution` (see `prisma/schema/pharmacy.prisma`), per File 11 Part 03/14.

**Status:** the full order lifecycle from creation through payment is implemented — order creation + broadcast fan-out, broadcast accept/decline, the pharmacist's quote (with substitution proposals), the patient's substitution reject/approve, payment capture, and order detail read. Engineering decisions are closed in `docs/FILE_12_Engineering_Decisions_And_Conventions.md` Part 39, including the branch-scoped pharmacy-staff RBAC lookup (`identity-auth`'s `GetActiveRoleMembershipUseCase`, Part 39.12), the first-accept-wins concurrency mechanics (Part 39.13), the quote contract's gaps vs. File 10 (Part 39.14-19), and payment-capture reuse (Part 39.20-23 — including why a File 10 line 375 refund scenario has no trigger in the modeled flow).

Planned build order (each its own pass, per Part 39.10):
1. ~~Order creation from an `ACCEPTED` prescription + broadcast fan-out to nearby branches.~~ Done.
2. ~~Broadcast accept/decline, with the first-accept-wins concurrency test (File 11 line 456).~~ Done.
3. ~~Quote/substitution: pharmacist marks item availability, proposes substitutions, patient rejects.~~ Done.
4. ~~Payment-capture wiring: patient `approve` resolves any pending substitution and captures payment in one call (`SUBSTITUTION_PROPOSED`/`ACCEPTED` → `PAID`), reusing `payments`' `CapturePayAtClinicPaymentUseCase` as-is.~~ Done. (Partial refund on substitution price reduction was scoped out — no trigger point exists in the modeled single-round-before-capture flow, Part 39.23.)
5. Broadcast-timeout worker cron (also tightens Phase 6's currently-unscoped pharmacist review queue, Part 37.4, once the branch-scoping lookup used here is applied there too).
