-- Backs `AppointmentRepository.listForPatient` ("My Appointments", File 12
-- Part 35.14/35.15), which filters on `patient_id` (optionally `status`) and
-- was running as a full sequential scan of `appointments` with no supporting
-- index.

CREATE INDEX "appointments_patient_id_status_idx" ON "appointments"("patient_id", "status");
