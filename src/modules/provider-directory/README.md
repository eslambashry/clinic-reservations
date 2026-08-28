# provider-directory

**MVP** — owns `Doctor`, `Clinic`, `ClinicBranch`, `DoctorClinicAffiliation`, `Pharmacy`, `PharmacyBranch`, `Specialty`, `Address`, `ProviderVerificationDocument` (see `prisma/schema/provider-directory.prisma`), per File 11 Part 03.

Phase 2 (complete): directory CRUD + manual verification workflow (Admin-only, File 11 07.3) + public search/detail (`GET /v1/doctors/search`, File 10 §2.3). Engineering decisions specific to this phase are recorded in `FILE_12_Engineering_Decisions_And_Conventions.md` Part 32 — read that before touching this module (name/photo storage gap, branch-vs-top-level verification scope, admin CRUD surface, `@OptionalAuth()`, search query additions, deferred role_membership provisioning).

Added 2026-08-28 (Part 37): `GET /v1/pharmacy-branches/search` — a pharmacy-search contract no source doc defines, filling the same category of gap Part 32 closed for doctors. The branch, not the pharmacy chain, is the searchable/browsable unit (only a branch has an address/phone).

Emits `ProviderVerified` (`{ providerType: 'DOCTOR'|'CLINIC'|'PHARMACY', providerId }`) on `POST /{doctors|clinics|pharmacies}/{id}/verify` — no consumer registered yet (Notifications is Phase 8), expected quiet backlog per File 11 Part 20.
