# Doctor Dashboard — architecture and flows

Companion to `FILE_12_Engineering_Decisions_And_Conventions.md` **Part 49**,
which carries the decisions and their rationale. This file is the picture.

Scope: the doctor-facing surface only — profile, clinics/branches,
availability, and the appointment queue including cancel and reschedule.
Patients and notifications are **not** covered; no backend module exists for
either yet, and the client still mocks them.

---

## 1. End-to-end topology

```mermaid
flowchart TB
    subgraph client["med-super — Flutter, provider_dashboard"]
        UI["Screens<br/>appointments · clinics · schedule · profile"]
        UC["Use cases"]
        REPO["ProviderDashboardRepository"]
        DS["Remote datasource (Dio)"]
        UI --> UC --> REPO --> DS
    end

    DS -->|"Bearer JWT<br/>Idempotency-Key<br/>X-Correlation-Id"| GUARDS

    subgraph api["clinic-reservations — API process"]
        GUARDS["Throttler → JwtAuthGuard → RbacGuard<br/>@Roles(DOCTOR)"]
        CTRL["Controllers<br/>DoctorClinics · DoctorScheduleTemplates · DoctorAppointments"]
        SCOPE["ResolveDoctorScopeUseCase<br/><b>ownership primitive</b>"]
        APP["Application use cases<br/>(shared with patient + admin routes)"]
        INFRA["Repositories<br/>optimistic lock via version"]
        ENV["ResponseInterceptor / ErrorEnvelopeFilter"]

        GUARDS --> CTRL --> APP
        APP --> SCOPE
        APP --> INFRA
        APP --> AUDIT["AuditService"]
        APP --> OUTBOX["OutboxService"]
        CTRL --> ENV
    end

    INFRA --> PG[("PostgreSQL")]
    AUDIT --> PG
    OUTBOX --> PG

    subgraph worker["clinic-reservations — worker process"]
        OW["OutboxWorker<br/>FOR UPDATE SKIP LOCKED"]
        SLOTJOB["SlotGenerationJob<br/>rolling window"]
        HOLDJOB["HoldExpiryJob"]
    end

    PG --> OW
    PG --> SLOTJOB
    SLOTJOB --> PG
    HOLDJOB --> PG
    ENV -->|"{success, data, requestId, correlationId}"| DS
```

Two things this picture is meant to make obvious:

* **`ResolveDoctorScopeUseCase` sits in the application layer, not the
  controller.** Controllers forward path params; ownership is decided against
  the JWT-derived scope inside the use case, and for writes inside the same
  transaction as the write.
* **`AuditService` and `OutboxService` are written with the same `tx`** as the
  business change. Neither is a post-commit side call.

---

## 2. Authorization and ownership

```mermaid
flowchart TD
    REQ["Request with Bearer JWT"] --> JWT{"JwtAuthGuard<br/>token valid?"}
    JWT -->|no| E401["401 UNAUTHENTICATED"]
    JWT -->|yes| RBAC{"RbacGuard<br/>contextType == DOCTOR?"}
    RBAC -->|no| E403["403 ROLE_NOT_PERMITTED"]
    RBAC -->|yes| RESOLVE["ResolveDoctorScopeUseCase<br/>Doctor.user_id = jwt.sub"]

    RESOLVE --> FOUND{"doctor row exists<br/>and not soft-deleted?"}
    FOUND -->|no| E404A["404 RESOURCE_NOT_FOUND"]
    FOUND -->|yes| SCOPE["scope = affiliationIds, clinicBranchIds"]

    SCOPE --> OWNS{"requested id ∈ scope?"}
    OWNS -->|no| E404B["<b>404</b> — never 403<br/>existence hiding"]
    OWNS -->|yes| RULE{"business rule holds?"}

    RULE -->|no| E422["422 e.g. APPOINTMENT_NOT_CANCELLABLE"]
    RULE -->|yes| LOCK{"version guard wins?"}
    LOCK -->|no| E409["409 OPTIMISTIC_LOCK_CONFLICT<br/>/ APPOINTMENT_STATE_CHANGED"]
    LOCK -->|yes| OK["200 / 201 / 204"]
```

| Rule | Where enforced |
|---|---|
| A doctor reads/edits only their own profile | `Doctor.user_id = jwt.sub` |
| A doctor sees only clinics/branches they are affiliated with | `scope.clinicBranchIds` |
| A doctor edits only branches they are affiliated with | `UpdateMyClinicBranchUseCase`, before any read |
| A doctor manages only their own affiliations' schedule templates | `assertOwned` predicate, inside the write transaction |
| A doctor reads/manages only their own appointments | `isAppointmentInScope`, inside the transaction |
| Ids from the client never define ownership | every id is re-checked against the JWT-derived scope |
| Cross-tenant ids are indistinguishable from missing ones | 404, never 403 |

---

## 3. Update the doctor profile

```mermaid
sequenceDiagram
    participant UI as Edit profile screen
    participant API as DoctorsController
    participant UC as UpdateMyDoctorProfileUseCase
    participant DB as PostgreSQL

    UI->>API: PATCH /v1/doctors/me {bio, degree, experienceYears}
    Note over API: @Roles(DOCTOR); ValidationPipe rejects<br/>licenseNumber/specialtyCode/status with 400
    API->>UC: execute(actor, dto)
    UC->>DB: findByUserId(jwt.sub)
    alt no doctor row
        UC-->>UI: 404 RESOURCE_NOT_FOUND
    else
        UC->>DB: BEGIN
        UC->>DB: update doctor (optimistic lock on version)
        UC->>DB: INSERT audit_logs<br/>provider_directory.doctor.update_self
        UC->>DB: COMMIT
        UC->>DB: re-read fresh profile
        UC-->>UI: 200 {…updated profile}
    end
    Note over UI: name/email go to PATCH /v1/auth/me —<br/>they live on User, not Doctor
```

---

## 4. Update clinic branch information

```mermaid
sequenceDiagram
    participant UI as My clinics screen
    participant API as DoctorClinicsController
    participant UC as UpdateMyClinicBranchUseCase
    participant SCOPE as ResolveDoctorScopeUseCase
    participant DB as PostgreSQL

    UI->>API: PATCH /v1/doctors/me/clinics/branches/{branchId}
    API->>UC: execute(branchId, dto, actor)
    UC->>SCOPE: execute(actor)
    SCOPE->>DB: doctor + affiliations for jwt.sub
    SCOPE-->>UC: {affiliationIds, clinicBranchIds}

    alt branchId ∉ clinicBranchIds
        UC-->>UI: 404 — no read, no write
    else
        UC->>DB: BEGIN
        UC->>DB: read branch + address (for their versions)
        UC->>DB: update branch phone / iana_timezone
        UC->>DB: update address line1 / city
        UC->>DB: INSERT audit_logs<br/>clinic_branch.update_by_doctor
        UC->>DB: COMMIT
        UC->>DB: re-read via ListMyDoctorClinicsUseCase
        UC-->>UI: 200 {…refreshed row}
    end
    Note over UC,DB: A branch is shared between doctors —<br/>which is why every edit is audited by actor.
```

---

## 5. Update the doctor's schedule

```mermaid
sequenceDiagram
    participant UI as Availability screen
    participant API as DoctorScheduleTemplatesController
    participant MINE as ManageMyScheduleTemplatesUseCase
    participant SHARED as UpdateScheduleTemplateUseCase
    participant DB as PostgreSQL
    participant JOB as SlotGenerationJob (worker)

    UI->>API: PATCH /v1/doctors/me/schedule-templates/{id}<br/>{startTime, endTime, version}
    API->>MINE: update(id, patch, actor)
    MINE->>MINE: ownedAffiliationIds from JWT scope
    MINE->>SHARED: execute(id, fields, actor,<br/>{expectedVersion, assertOwned})

    SHARED->>DB: BEGIN
    SHARED->>DB: read template
    alt not owned
        SHARED-->>UI: 404
    else version mismatch
        SHARED-->>UI: 409 OPTIMISTIC_LOCK_CONFLICT
    else endTime <= startTime
        SHARED-->>UI: 422 INVALID_SCHEDULE_WINDOW
    else
        SHARED->>DB: update template (version++)
        SHARED->>DB: INSERT audit_logs
        SHARED->>DB: COMMIT
        SHARED-->>UI: 200 {…template, version+1}
    end

    Note over DB,JOB: Existing appointment_slots are NOT touched.<br/>The change affects the next generation run only.
    JOB->>DB: generate future slots from templates
```

---

## 6. Cancel an appointment as the provider

```mermaid
sequenceDiagram
    participant UI as Appointment detail
    participant API as DoctorAppointmentsController
    participant UC as CancelAppointmentUseCase (shared)
    participant SCOPE as ResolveAppointmentScopeUseCase
    participant PAY as ProcessCancellationRefundUseCase
    participant DB as PostgreSQL
    participant OW as OutboxWorker

    UI->>API: POST /v1/doctors/me/appointments/{id}/cancel<br/>Idempotency-Key + {reason: PROVIDER_REQUEST, note}
    API->>UC: execute(id, dto, actor)
    UC->>SCOPE: execute(actor)
    SCOPE-->>UC: {kind: DOCTOR, affiliationIds}

    alt reason != PROVIDER_REQUEST
        UC-->>UI: 422 CANCELLATION_REASON_NOT_PERMITTED
    end

    UC->>DB: BEGIN
    UC->>DB: read appointment
    alt affiliation ∉ scope
        UC-->>UI: 404
    else status != CONFIRMED
        UC-->>UI: 422 APPOINTMENT_NOT_CANCELLABLE
    else
        UC->>DB: UPDATE … WHERE version = n AND status = 'CONFIRMED'
        alt 0 rows (lost the race)
            UC-->>UI: 409 APPOINTMENT_STATE_CHANGED
        else
            UC->>DB: slot BOOKED → OPEN
            UC->>PAY: refund, feePercent = 0 (provider waives it)
            PAY->>DB: refund + ledger rows
            UC->>DB: INSERT audit_logs (reasonCode=PROVIDER_REQUEST)
            UC->>DB: INSERT outbox_events AppointmentCancelled<br/>{patientId, cancelledBy: DOCTOR}
            UC->>DB: COMMIT
            UC-->>UI: {status: CANCELLED, refundAmount, feeApplied: 0}
        end
    end

    OW->>DB: drain outbox (worker process)
```

Everything between `BEGIN` and `COMMIT` is one transaction: the slot release,
the refund, the audit row and the outbox event either all land or none do.

---

## 7. Reschedule an appointment

```mermaid
flowchart TD
    START["POST .../{id}/reschedule {newSlotId}"] --> SCOPE["resolve actor scope"]
    SCOPE --> READ["read appointment (in tx)"]
    READ --> OWN{"in scope?"}
    OWN -->|no| N404["404"]
    OWN -->|yes| CONF{"status == CONFIRMED?"}
    CONF -->|no| N422["422 APPOINTMENT_NOT_RESCHEDULABLE"]
    CONF -->|yes| SAME{"newSlot.affiliation ==<br/>appointment.affiliation?"}
    SAME -->|no| N404B["404 — cannot move to<br/>another doctor or branch"]
    SAME -->|yes| SPINE

    subgraph SPINE["shared spine — one transaction"]
        direction TB
        S1["old appointment → RESCHEDULED (version-guarded)"]
        S2["old slot BOOKED → OPEN"]
        S3["new slot OPEN → HELD"]
        S4["create AppointmentHold<br/>owned by appointment.patient_id"]
        S1 --> S2 --> S3 --> S4
    end

    SPINE --> WHO{"actor kind"}

    WHO -->|PATIENT| P1["emit AppointmentHeld"]
    P1 --> P2["return {status: HELD, holdId, expiresAt}"]
    P2 --> P3["patient confirms separately<br/>POST /v1/appointments/{holdId}/confirm"]

    WHO -->|DOCTOR| D1["hold ACTIVE → CONVERTED"]
    D1 --> D2["new slot HELD → BOOKED"]
    D2 --> D3["create new appointment CONFIRMED<br/>carries payment_intent_id +<br/>rescheduled_from_appointment_id"]
    D3 --> D4["emit AppointmentRescheduledByProvider"]
    D4 --> D5["return {status: CONFIRMED, appointmentId}"]
```

The provider branch does not skip the hold: it creates and converts one in
the same transaction. What it skips is the client round-trip, because a
patient-owned 5-minute hold would strand the patient with no appointment
if they were not looking at their phone (Part 49.9).

---

## 8. Where each response comes from

| Client call | Backend | Scope resolved by |
|---|---|---|
| `GET /v1/doctors/me` | `GetMyDoctorProfileUseCase` | `Doctor.user_id = sub` |
| `PATCH /v1/doctors/me` | `UpdateMyDoctorProfileUseCase` | `Doctor.user_id = sub` |
| `GET`/`PATCH /v1/auth/me` | `identity-auth` | `User.id = sub` |
| `GET /v1/doctors/me/clinics` | `ListMyDoctorClinicsUseCase` | `ResolveDoctorScopeUseCase` |
| `PATCH .../clinics/branches/{id}` | `UpdateMyClinicBranchUseCase` | `scope.clinicBranchIds` |
| `PATCH .../clinics/affiliations/{id}` | `UpdateMyAffiliationUseCase` | `scope.affiliationIds` |
| `GET .../schedule-templates` | `ListMyScheduleTemplatesUseCase` | `scope.affiliationIds` |
| `POST/PATCH/DELETE .../schedule-templates` | `ManageMyScheduleTemplatesUseCase` → shared CRUD | `assertOwned` in-transaction |
| `GET .../appointments` | `ListDoctorAppointmentsUseCase` | `scope.affiliationIds` |
| `GET .../appointments/{id}` | `GetDoctorAppointmentUseCase` | `isAppointmentInScope` |
| `POST .../appointments/{id}/cancel` | `CancelAppointmentUseCase` *(shared with patient route)* | `ResolveAppointmentScopeUseCase` |
| `POST .../appointments/{id}/reschedule` | `RescheduleAppointmentUseCase` *(shared)* | `ResolveAppointmentScopeUseCase` |
