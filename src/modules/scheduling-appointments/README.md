# scheduling-appointments

**MVP** — owns `ScheduleTemplate`, `AppointmentSlot`, `AppointmentHold`, `Appointment` (see `prisma/schema/scheduling.prisma`), per File 11 Part 03.

**Phase 3 (Availability) is complete**: Admin CRUD for `schedule_templates`, the `GenerateSlotsUseCase`/`SlotGenerationJob` rolling-window materialization job, and `GET /v1/doctors/{doctorId}/slots` — see `docs/FILE_12_Engineering_Decisions_And_Conventions.md` Part 33 for the engineering decisions this closed.

**Phase 4 (Appointments) is complete** (Part 35). Implemented and tested against a real local Postgres (unit + integration, `appointment-hold-concurrency.integration.spec.ts`):
- `POST /v1/appointments/hold` / `POST /v1/appointments/{holdId}/confirm` — pay-at-clinic only, Payments module doesn't exist yet (Part 35.4).
- `POST /v1/appointments/{appointmentId}/cancel` — patient-only (Part 35.8), `feeApplied`/`refundAmount` always `0` in this phase (Part 35.7).
- `POST /v1/appointments/{appointmentId}/reschedule` — releases the old slot, creates a fresh hold on the new one (same affiliation only, Part 35.11); the patient still calls `/confirm` on the returned `holdId` (Part 35.10/35.12).
- `GET /v1/appointments` (cursor-paginated by slot `start_at`, Part 35.15) / `GET /v1/appointments/{id}` — both patient-only in this increment (Part 35.14), response shape per Part 35.17.
- `HoldExpiryJob` reaper (every minute).

All of the above are patient-only for now — doctor/clinic-staff read/write access needs a branch-scoped authorization primitive that doesn't exist yet anywhere in this codebase (Part 35.8/35.14), not just here; that's a cross-cutting `shared/core` piece for whoever builds the Provider Dashboard backend, not a gap specific to this module.

Added 2026-09-04 (Part 49): the **doctor-facing half** of this module.

`/v1/doctors/me/schedule-templates` (CRUD) un-defers Part 33.1's Admin-only
restriction, and `/v1/doctors/me/appointments` (list/detail/cancel/reschedule)
un-defers Part 35.8/35.14's patient-only restriction. Both take ownership from
`provider-directory`'s exported `ResolveDoctorScopeUseCase` — never from a
path param, and never with a cross-module query.

Neither is a second implementation. Schedule templates delegate to the same
`Create/Update/DeleteScheduleTemplateUseCase` with an `assertOwned` predicate
pushed into the write transaction; cancel and reschedule are the *same*
use-cases the patient routes call, with ownership resolved through
`ResolveAppointmentScopeUseCase` instead of a hard-coded `patient_id` check.
The Admin (`/v1/schedule-templates`) and patient (`/v1/appointments`) routes
are unchanged.

One behavioural difference worth knowing: a **provider**-initiated reschedule
completes in one transaction (hold → convert → book → new `CONFIRMED`
appointment) rather than returning a 5-minute hold the patient must confirm,
because the old appointment is already `RESCHEDULED` by then and an expired
hold would strand the patient with nothing. `payment_intent_id` carries over.
See Part 49.9 for the full reasoning.

Added 2026-09-05 (Part 50, Payments Phase 9 — online gateway + internal
wallet, DEC-001 = Paymob): `POST /v1/appointments/{holdId}/payments`
(`InitiateOnlineAppointmentPaymentUseCase`) initiates a `CARD`/`FAWRY`/
`MOBILE_WALLET` payment against a hold — extends the hold to that method's
window (15 min Fawry / 10 min mobile wallet / unchanged 5 min card) and
returns the client-facing iframe URL / Fawry reference / wallet redirect.
The appointment is NOT created here — only once `POST
/v1/webhooks/payments/{provider}` (`PaymentsWebhookController` +
`ProcessPaymentWebhookUseCase`) receives a signature-verified success
callback does it atomically convert the hold and confirm the appointment
(reusing the same `AppointmentHold.markConverted` race-guard `ConfirmAppointmentUseCase`
already relies on); a webhook arriving after the hold has already expired
triggers `payments`' capture-then-auto-refund path instead of confirming a
stale booking. `ConfirmAppointmentUseCase` itself gained one more
synchronous branch — `paymentMethod: 'INTERNAL_WALLET'` — alongside the
unchanged `PAY_AT_CLINIC` one. This webhook controller is hosted here
(not in `payments`) specifically to avoid a circular module import — see
its own doc comment. See `payments/README.md` for the wallet/gateway side.
