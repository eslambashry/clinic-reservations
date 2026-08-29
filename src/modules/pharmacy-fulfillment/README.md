# pharmacy-fulfillment

**MVP** — owns `PharmacyOrder`, `PharmacyOrderBroadcast`, `PharmacyOrderItem`, `Substitution` (see `prisma/schema/pharmacy.prisma`), per File 11 Part 03/14.

**Status:** the full order lifecycle from creation through payment is implemented — order creation + broadcast fan-out, broadcast accept/decline, the pharmacist's quote (with substitution proposals), the patient's substitution reject/approve, payment capture, and order detail read. Engineering decisions are closed in `docs/FILE_12_Engineering_Decisions_And_Conventions.md` Part 39, including the branch-scoped pharmacy-staff RBAC lookup (`identity-auth`'s `GetActiveRoleMembershipUseCase`, Part 39.12), the first-accept-wins concurrency mechanics (Part 39.13), the quote contract's gaps vs. File 10 (Part 39.14-19), and payment-capture reuse (Part 39.20-23 — including why a File 10 line 375 refund scenario has no trigger in the modeled flow).

Planned build order (each its own pass, per Part 39.10):
1. ~~Order creation from an `ACCEPTED` prescription + broadcast fan-out to nearby branches.~~ Done.
2. ~~Broadcast accept/decline, with the first-accept-wins concurrency test (File 11 line 456).~~ Done.
3. ~~Quote/substitution: pharmacist marks item availability, proposes substitutions, patient rejects.~~ Done, then **replaced** (see below).
4. ~~Payment-capture wiring: patient `approve` resolves any pending substitution and captures payment in one call (`SUBSTITUTION_PROPOSED`/`ACCEPTED` → `PAID`), reusing `payments`' `CapturePayAtClinicPaymentUseCase` as-is.~~ Done. (Partial refund on substitution price reduction was scoped out — no trigger point exists in the modeled single-round-before-capture flow, Part 39.23.)
5. Broadcast-timeout worker cron (also tightens Phase 6's currently-unscoped pharmacist review queue, Part 37.4, once the branch-scoping lookup used here is applied there too). Still not built.

**2026-08-29 — `medsuper-pharmacy-dashboard` integration pass.** The dashboard
was built against its own, never-agreed contract (`docs/PROPOSED_CONTRACT.md`
in that repo); reconciling the two surfaced that this module's item-by-item
quote (step 3 above) directly conflicted with the dashboard's "no drug data"
product decision. Resolved in the dashboard's favor — a real product-priority
call, documented as a new decision in `docs/FILE_12_Engineering_Decisions_And_Conventions.md`
(after Part 39), not a silent reversal:

- **Quote is now flat** (`totalPrice`/`estimatedReadyMinutes`/`note` on the
  order itself) instead of per-`PharmacyOrderItem` pricing. `SUBSTITUTION_PROPOSED`
  is now unreachable through this console (kept in the schema, forward-compat
  only). `SubmitPharmacyOrderQuoteUseCase` also now claims an unclaimed order
  as part of quoting it (the dashboard never had a separate "accept" screen) —
  `accept`/`decline`/`AcceptPharmacyOrderBroadcastUseCase`/
  `DeclinePharmacyOrderBroadcastUseCase` remain valid, separately-callable
  primitives, just unused by this particular console.
- **New: `RejectPharmacyOrderUseCase`** — `PHARMACY_STAFF` rejects a claimed
  order outright (`UNDER_REVIEW`/`ACCEPTED --> REJECTED`) or declines an
  unresponded broadcast, both behind `POST .../reject`, dispatched by actor
  role in the controller.
- **New: `FulfillPharmacyOrderUseCase`/`CompletePharmacyOrderUseCase`** —
  `PAID --> READY_FOR_PICKUP`/`OUT_FOR_DELIVERY --> FULFILLED`. This whole
  post-payment progression didn't exist before this pass. No `DELIVERED`
  intermediate status was added — the dashboard's own documented fallback was
  taken instead.
- **New: `ListPharmacyOrdersUseCase`** (`GET /pharmacy-orders`) — the queue
  listing item 5 above already named as missing. Role-aware: a patient's own
  orders, or a branch's claimed orders plus its incoming unanswered
  broadcasts.
- **`GetPharmacyOrderUseCase` reshaped** to match the dashboard's own
  `PharmacyOrder` type (patient/prescription projections, flat `quote`,
  `rejection`) instead of the original `items[]`/`substitutions[]` shape.
  Reuses a new `pharmacy-order-detail.mapper.ts`, shared with the list
  endpoint (which enriches every row the same way — an accepted N+1 for an
  MVP staff console, not a performance target).
- New `identity-auth` export `GetUserSummaryUseCase` and `prescriptions`
  export `GetPrescriptionSummaryUseCase` back the above.
