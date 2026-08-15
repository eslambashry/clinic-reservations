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
