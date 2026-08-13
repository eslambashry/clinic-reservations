# scheduling-appointments

**MVP** — owns `ScheduleTemplate`, `AppointmentSlot`, `AppointmentHold`, `Appointment` (see `prisma/schema/scheduling.prisma`), per File 11 Part 03.

**Phase 3 (Availability) is complete**: Admin CRUD for `schedule_templates`, the `GenerateSlotsUseCase`/`SlotGenerationJob` rolling-window materialization job, and `GET /v1/doctors/{doctorId}/slots` — see `docs/FILE_12_Engineering_Decisions_And_Conventions.md` Part 33 for the engineering decisions this closed. **Phase 4 (Appointments — hold/confirm/cancel/reschedule)** is not yet built; `AppointmentHold`/`Appointment` remain schema-only.
