# doctor-requests

MVP. A patient asks for a doctor who is not on the platform (all details optional, at least one required). Admin gets a push + inbox notification (`NewDoctorRequestForAdmin`), reviews on the dashboard and moves the status PENDING -> IN_REVIEW -> DOCTOR_ADDED | REJECTED with an optional note. The patient is notified (`DoctorRequestStatusChanged`, data carries `doctorRequestId`/`status`) and sees all their requests via `GET /v1/doctor-requests/mine`.
