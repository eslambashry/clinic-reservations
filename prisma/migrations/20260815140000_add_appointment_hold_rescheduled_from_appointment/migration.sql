-- File 12 Part 35.13: lets a hold created by `POST .../reschedule` carry a
-- pointer to the appointment it's replacing, so `ConfirmAppointmentUseCase`
-- can propagate it onto the new `Appointment.rescheduled_from_appointment_id`
-- at confirm time (the new Appointment row doesn't exist before then, Part
-- 35.1). Same nullable-relation FK shape Prisma already generated for
-- `appointments.rescheduled_from_appointment_id` (init migration).

ALTER TABLE "appointment_holds" ADD COLUMN "rescheduled_from_appointment_id" UUID;

ALTER TABLE "appointment_holds" ADD CONSTRAINT "appointment_holds_rescheduled_from_appointment_id_fkey" FOREIGN KEY ("rescheduled_from_appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
