# reviews

MVP (un-postponed 2026-11-16, see `appback/plans/doctor_reviews_plan.md`). Doctor reviews only: patient rates the doctor once per COMPLETED appointment; published immediately, Admin can hide. `doctors.rating_avg`/`rating_count` are recomputed from PUBLISHED reviews in the same transaction (via `provider-directory`'s `RecomputeDoctorRatingUseCase`). Clinics/pharmacies/labs remain POSTPONE.
