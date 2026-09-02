# laboratory

**MVP** — un-postponed 2026-09-02 (was POSTPONE with zero schema/endpoints since inception). Owns `Laboratory`,
`LabBranch`, `TestCatalog`, `LabOrder`, `LabOrderItem`, `LabResultDocument`, `LabOrderNote` (see
`prisma/schema/laboratory.prisma`), per `docs/FILE_12_Engineering_Decisions_And_Conventions.md` Part 47.

**Status:** the full order lifecycle is implemented — request → quote → confirm-booking → arrival/courier dispatch →
sample collection → analysis → per-item result recording → critical-value flag → result delivery attestation, plus
reject/reschedule/recollect side paths. A custody trail (every transition) is readable via `GET /lab-audit`.

**Provenance is the opposite of every other module here.** `pharmacy-fulfillment`/`scheduling-appointments`/etc. were
all built from `docs/FILE_11_...md` first, with a dashboard connected afterward. Laboratory had **no File 10/11 spec
at all** — this module was built directly against `medsuper-laboratory-dashboard`'s own already-complete
`src/lib/api/types.ts`/`service.ts`/`mock-service.ts` contract, the only authoritative source at un-postpone time.
Every route, DTO field name, and status value below was chosen to match that dashboard exactly, not the reverse —
see Part 47 for the full accounting of what was copied verbatim vs. genuinely decided here.

Key decisions (Part 47, full detail there):
- **No new custody-event table** — every use-case calls the existing `audit` module's `AuditService.record`
  (`AuditService.listByResource`, the same cross-module read path Part 43 introduced for pharmacy). Unlike
  pharmacy's one-shot quote/reject, lab custody events **recur** (multiple notes, multiple per-item results,
  reject→recollect cycles), so `audit_logs.reason_code` is populated with each event's own detail text at write
  time — the first module to actually use that column.
- **`confirm-booking` (new, not in the original dashboard mock's transition set)** — closes a real gap:
  `BOOKING_CONFIRMED`/`bookingCode` were already declared in the dashboard's types but nothing ever produced them,
  so a quoted order could never progress. `POST /lab-orders/{id}/confirm-booking` (`LAB_STAFF`) implements it.
- **Minimal real `POST /lab-orders` (`PATIENT`)** exists so the module is testable end-to-end (curl/Postman) — not
  wired into any Flutter screen; the dashboard itself has no "new order" flow by design.
- **Payment is explicitly out of scope** — matches the dashboard's own state machine exactly (no `PAID`-style gate
  blocks any transition today). `PayableType.LAB_ORDER` stays reserved-but-unused.
- **`rejection_reason` is a plain `String` column, not a Postgres enum** — the dashboard's own
  `RejectOrderRequest.reason` is free-text, unlike pharmacy's closed `PharmacyOrderRejectionReason` set.

**Frontend connection (2026-09-02):** `medsuper-laboratory-dashboard`'s `HttpLaboratoryOrdersService` implements
every `LaboratoryOrdersService` method against the routes here; `NEXT_PUBLIC_API_BASE_URL` genuinely selects it
(`isMockMode()` is env-driven). **Real auth bridge closed the same day (Part 48)**: the console's existing
`/auth/*` route scaffolding (already present, just never connected to a real backend) now calls this module's
already-role-agnostic `/auth/*` endpoints for real, plus one new minimal `GET /lab-branches/{id}` (self-scoped
branch display, `LabBranchesController`/`GetLabBranchUseCase`) — no other backend change was needed for auth
itself. `src/db/seed.ts` seeds a real, password-set, branch-assigned `LAB_STAFF` test account
(`+201000000004`/`DevPass123!`) so this is curl/browser-testable against a real Postgres with no manual DB edit.

**Verification:** backend `tsc --noEmit`/`eslint` clean, `jest src/modules/laboratory` 88/88 (20 suites) passing.
Not run: `db:migrate:deploy` against a real Postgres, any live browser click-through — no local DB is provisioned
in this environment, flagged rather than assumed, same as pharmacy's own later Part 42 real-infrastructure pass.

Not built (explicitly out of scope, tracked as open decisions in the dashboard's own `types.ts`):
- `DEC-002` — payment timing.
- `DEC-003` — automated critical-result escalation (the human critical/non-critical call exists; automated
  detection does not).
- `DEC-004` — result delivery channel (only a staff self-attestation exists; no push/email/SMS is sent).
- `DEC-005` — ordering-doctor visibility into results (depends on the deferred `encounter-emr` module).
- `DEC-006` — whether a partial per-item result panel is the final model (adopted here as the working assumption).
