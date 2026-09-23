# prescriptions

**MVP** — owns `DrugCatalog`, `Prescription`, `PrescriptionItem`, `PrescriptionImage`, `PrescriptionReview` (see `prisma/schema/prescriptions.prisma`), per File 11 Part 03.

Doctor-issued prescriptions (File 12 Part 51, 2026-09-19) reuse `Prescription` and the existing `PharmacyOrder` fulfillment flow. `POST /v1/prescriptions/provider` creates a doctor-signed `ACCEPTED` prescription or an assistant-prepared `PENDING_DOCTOR_APPROVAL` draft; only the supervising doctor can approve/reject drafts. Provider list/detail routes expose scoped status/history, and pending drafts are hidden from patient/pharmacy reads. A separately submitted `POST /v1/pharmacy-orders/provider` feeds the existing pharmacy broadcast queue after approval. Assistant capability remains controlled by seeded RBAC permission codes. See Part 51 for schema and limitations; migration and end-to-end verification are tracked there.
