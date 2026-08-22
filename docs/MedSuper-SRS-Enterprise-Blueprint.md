# MedSuper — Enterprise Medical Super App
## Software Requirements Specification & Product Blueprint (v1.0)

**Prepared as a direct-to-implementation enterprise spec.** Scope: Patient, Doctor, Clinic, Pharmacy, Laboratory, Super Admin — one unified platform, six connected roles, one data spine.

---

## 0. Redesign Notes (What We Changed vs. the Original "Vezeeta-like" Idea, and Why)

Documenting the original idea as-is would inherit its weaknesses. As a product team, we made these deliberate changes:

| Original assumption | Problem | Our redesign |
|---|---|---|
| Booking, pharmacy, lab are separate silos | Patients re-enter data 3x, no unified health record | **Single Patient Health Graph** — one record, all encounters (visit, prescription, lab result) link to it |
| Clinics and Doctors treated as one entity | Doctors work across multiple clinics; clinics have multiple doctors | Modeled as **many-to-many** with per-affiliation schedules/pricing |
| Payment is an afterthought bolt-on | Refunds, partial payments, insurance co-pay are common in healthcare | Payment is a **first-class ledger service** with holds, splits, and reconciliation states |
| Notifications = simple SMS blast | Different roles need different urgency/channel (doctor no-show vs. lab result ready) | **Notification is a rules engine**, not a message sender — priority tiers, channel fallback, quiet hours |
| One login/role model | A person can be a Patient AND, separately, a Doctor's front-desk staff | **Identity is decoupled from Role-Context** — one account, multiple role memberships, switchable context |
| Cancellation = free-for-all | Revenue leakage, doctor time loss, clinic no-show abuse | **Tiered, policy-driven cancellation engine** with fee schedules and no-show scoring |
| Reviews/ratings absent | Trust signal missing, core to marketplace conversion | Added **verified-visit-only reviews** (can't review a doctor you never saw) |
| E-prescription not specified | Pharmacy workflow can't function without structured Rx data | Added **structured e-Prescription object** (drug code, dose, frequency, duration, substitution flag) as the pharmacy workflow's backbone |
| Lab workflow assumed walk-in only | Home sample collection is now standard in the market | Added **home phlebotomy workflow** as first-class, not an afterthought |
| No offline/low-connectivity design | Egypt/MENA target market has variable connectivity | Mobile apps ship with **offline-first booking cache and queued actions** |

We optimized every core workflow (booking, prescription fulfillment, lab ordering, payment, notification) for **minimum user actions** — detailed in each workflow section with a "steps saved" callout.

---

## 1. Product Vision

**Vision statement:** MedSuper is the single digital front door to healthcare in the region — one app where a patient finds a doctor, books a visit, pays, gets a prescription, fills it at a pharmacy, orders a lab test, and receives results, with every step connected to one continuous health record. For providers (doctors, clinics, pharmacies, labs), MedSuper is the operating system that fills their schedule, manages their patients, and gets them paid — without them needing separate software.

**Product pillars:**
1. **One record, everywhere** — a patient's history is visible (permission-gated) across every role that touches their care.
2. **Fewest taps to care** — every critical workflow (book, pay, refill, get results) is optimized to the minimum number of user actions.
3. **Trust by design** — verified providers, verified reviews, transparent pricing, auditable data access.
4. **Built for real infrastructure** — offline-tolerant, low-bandwidth-friendly, SMS-fallback notifications.
5. **Compliant by default** — privacy and medical-data handling are architectural constraints, not features bolted on later.

---

## 2. Business Goals

| Goal | Metric (KPI) | Target (Year 1) |
|---|---|---|
| Grow supply (providers) | # verified doctors, clinics, pharmacies, labs onboarded | 5,000 doctors / 500 clinics / 1,000 pharmacies / 300 labs |
| Grow demand (patients) | Monthly Active Patients (MAP) | 500,000 MAP |
| Booking conversion | Search → Confirmed booking rate | ≥ 35% |
| Marketplace liquidity | % appointment slots filled | ≥ 60% |
| Reduce no-shows | No-show rate | < 8% (from industry avg ~20%) |
| Monetization | Take rate on bookings + pharmacy/lab orders | 8–15% blended |
| Retention | 90-day patient retention | ≥ 45% |
| Provider satisfaction | Provider NPS | ≥ 40 |
| Payment reliability | Payment success rate | ≥ 98% |
| Support cost efficiency | % issues resolved without human agent (self-serve cancel/reschedule) | ≥ 70% |

**Monetization model:**
- Commission per completed booking (tiered by specialty/volume)
- SaaS subscription tier for Clinics/Labs/Pharmacies (dashboard, analytics, multi-branch management)
- Featured/sponsored placement in search (clearly labeled "Sponsored")
- Payment processing margin
- Data-driven insights product for enterprise clinic chains (aggregated, de-identified analytics)

---

## 3. User Personas

### 3.1 Patient — "Mona, 34, working mother"
Needs: fast booking around a busy schedule, trustworthy doctor ratings, remembers her kids' vaccination history, wants to avoid clinic waiting rooms when possible, price transparency before booking.

### 3.2 Doctor — "Dr. Ahmed, cardiologist, works across 2 clinics"
Needs: single calendar across both clinics, minimal admin overhead, gets paid on time, wants a lightweight EMR view of patient history before a visit, doesn't want to manage marketing.

### 3.3 Clinic Admin/Front-desk — "Heba, clinic operations manager"
Needs: manage multiple doctors' schedules, walk-in vs. online booking reconciliation, staff permissions, daily reconciliation of payments, reduce phone-call load.

### 3.4 Pharmacy Owner/Pharmacist — "Karim, independent pharmacy"
Needs: receive e-prescriptions instantly, manage inventory/stock-outs gracefully, fulfill delivery or pickup, avoid dispensing errors, handle controlled substances compliantly.

### 3.5 Lab Manager/Technician — "Yasmin, central lab with branch network"
Needs: receive digital lab orders, schedule home collection or in-branch, upload results securely, flag critical values fast, manage sample chain-of-custody.

### 3.6 Super Admin — "Platform Operations Team"
Needs: onboard/verify providers, monitor platform health, handle disputes/fraud, configure commission and cancellation policies per region, full audit trail, business intelligence across all roles.

---

## 4. User Journeys (Key End-to-End Flows)

### 4.1 Patient Journey — "I have a sore throat"
Search symptom/specialty → filter by location/insurance/price/availability → view doctor profile (ratings, next slot) → book slot → pay (or pay-at-clinic) → receive confirmation + reminders → attend visit (in-person/video) → receive e-prescription + visit summary → one-tap "send to nearest pharmacy" → pharmacy confirms stock & price → pay & receive delivery/pickup → optional: doctor orders lab test → one-tap "book home collection" → receive results in app, linked to the same visit.

**Steps saved vs. traditional flow:** patient never re-types symptoms/history for pharmacy or lab; both inherit context from the doctor visit automatically. Estimated reduction: 12 manual steps → 4.

### 4.2 Doctor Journey
Log in → see unified day view (both clinic affiliations) → tap patient → see history snapshot (last visit, allergies, active prescriptions) → conduct visit → issue e-prescription/lab order from a searchable drug/test catalog (autocomplete, dosage presets) → visit auto-closes → payout accrues.

### 4.3 Clinic Journey
Admin sets up branch, doctors, room/resource availability → doctor schedules sync automatically → front-desk sees combined online+walk-in queue → daily settlement report auto-generates.

### 4.4 Pharmacy Journey
Receive e-Rx notification → pharmacist reviews (auto-flag interactions/substitutions) → confirms stock and price → patient pays in-app or COD → pharmacy prepares → courier/pickup handoff → order closes, inventory decrements.

### 4.5 Laboratory Journey
Receive digital lab order (from doctor or self-requested by patient) → patient chooses home collection or branch visit → phlebotomist route optimized → sample logged with barcode → result entered/uploaded by technician → critical-value auto-flagged to doctor + patient → result released to patient record.

### 4.6 Super Admin Journey
Review provider verification queue → approve/reject with reason → monitor live dashboard (bookings, GMV, disputes, SLA breaches) → configure region-specific rules (cancellation fee %, commission %) → investigate flagged fraud/no-show patterns → generate compliance/audit reports.

---

## 5. User Stories (Representative Set by Role)

**Patient**
- As a patient, I want to filter doctors by insurance network so I only see relevant, affordable options.
- As a patient, I want to book without creating an account first (guest checkout with phone OTP) so the funnel doesn't lose me.
- As a patient, I want to see my full family's health records (linked profiles) so I can manage my children's/parents' care.
- As a patient, I want to reschedule with one tap within policy limits so I don't lose my deposit unnecessarily.
- As a patient, I want to know before paying whether a pharmacy has my medicine in stock.

**Doctor**
- As a doctor, I want to block personal time off across all my clinic affiliations in one action.
- As a doctor, I want to see a patient's medication history before prescribing, to avoid interactions.
- As a doctor, I want to issue a digital prescription that a pharmacy can act on immediately, with no fax/paper.

**Clinic**
- As a clinic admin, I want to manage multiple doctors and rooms without scheduling conflicts.
- As a clinic admin, I want a daily settlement report reconciling online payments vs. cash.

**Pharmacy**
- As a pharmacist, I want incoming e-prescriptions to be auto-checked against my inventory before I accept the order.
- As a pharmacist, I want controlled substances flagged and requiring extra verification steps.

**Laboratory**
- As a lab tech, I want to flag a critical result and have it push immediately to the ordering doctor, not wait for a batch job.
- As a lab manager, I want to manage phlebotomist routes for home collections efficiently.

**Super Admin**
- As a super admin, I want a single fraud/risk queue across all roles (fake reviews, doctor impersonation, pharmacy overcharging).
- As a super admin, I want to configure cancellation and commission policy per country/region without a code deploy.


---

## 6. Functional Requirements

### 6.1 Identity & Account (shared across roles)
- FR-1: One physical person = one account (unique phone/email + national ID hash for providers).
- FR-2: Account can hold multiple **role-memberships** (e.g., Patient + Clinic front-desk staff), switchable via context switcher; each membership has independent permissions.
- FR-3: OTP-based phone verification is mandatory for all roles; email optional for Patient, mandatory for Doctor/Clinic/Pharmacy/Lab admin accounts.
- FR-4: Guest checkout allowed for booking (phone + OTP only); full account created silently on first booking, upgradable later.
- FR-5: Provider accounts (Doctor, Clinic, Pharmacy, Lab) require document verification (license, syndicate ID, commercial registration) before going live in search.

### 6.2 Patient
- FR-10: Search doctors/clinics by specialty, symptom keyword, location radius, price range, insurance, language, gender, availability window.
- FR-11: View doctor profile: bio, qualifications, verified badge, rating/review summary, price per visit type, next available slots, clinic affiliations.
- FR-12: Book appointment (in-person, video, home visit where supported).
- FR-13: Maintain a Family Profile Group (linked dependents) with a single login.
- FR-14: View unified Health Record: visit history, prescriptions, lab results, allergies, chronic conditions, vaccination log.
- FR-15: Reschedule/cancel per policy; see fee before confirming.
- FR-16: Pay online (card/wallet) or select pay-at-clinic; see itemized price breakdown pre-booking.
- FR-17: Receive e-prescription; one-tap send to a chosen or "nearest available" pharmacy.
- FR-18: Order lab tests directly (self-requested, non-doctor-ordered) for a defined open panel of tests, or fulfill a doctor-ordered test.
- FR-19: Rate/review only after a verified completed visit (no review without an attended encounter).
- FR-20: Store/view insurance card & policy number; see in-network providers.

### 6.3 Doctor
- FR-30: Manage availability across all clinic affiliations from one calendar.
- FR-31: Define visit types (in-person/video/home) with independent pricing and duration per affiliation.
- FR-32: View patient snapshot before visit: last 3 visits, active meds, allergies, latest lab flags.
- FR-33: Issue structured e-prescription (drug catalog with dose/frequency/duration/substitution-allowed flag).
- FR-34: Issue structured lab order (test panel catalog, clinical notes, priority flag).
- FR-35: Close visit with encounter notes (SOAP-style optional template).
- FR-36: View payout ledger and pending settlement per clinic.
- FR-37: Block time off / mark unavailable in bulk (vacation mode) across all affiliations at once.

### 6.4 Clinic
- FR-50: Manage branches, rooms/resources, doctor roster and affiliation terms (commission split).
- FR-51: Manage front-desk staff accounts with scoped permissions (view-only, booking-manage, financial).
- FR-52: Register walk-in patients directly into the same booking/queue system as online bookings.
- FR-53: View combined schedule (online + walk-in) per doctor per room.
- FR-54: Daily/weekly settlement report: gross bookings, commission owed, net payout.
- FR-55: Configure clinic-level cancellation policy within Super Admin-defined bounds.

### 6.5 Pharmacy
- FR-70: Receive real-time e-prescription orders; accept/reject with reason (out of stock, needs substitution approval).
- FR-71: Maintain inventory catalog with stock levels; system suppresses "in stock" claim if inventory not synced within SLA (avoid false positives).
- FR-72: Flag controlled/scheduled drugs for additional verification step (photo ID / manual pharmacist confirmation).
- FR-73: Offer delivery and/or pickup; integrate with courier partner or self-fleet.
- FR-74: Auto drug-interaction check against patient's active medication list (opt-in, permissioned).
- FR-75: Manage pricing, discounts, and generic-substitution rules per SKU.

### 6.6 Laboratory
- FR-90: Receive digital lab orders (doctor-issued or patient self-requested).
- FR-91: Offer home sample collection scheduling with phlebotomist routing, or branch visit booking.
- FR-92: Barcode-based chain-of-custody for every sample (collection → transport → processing → result).
- FR-93: Upload results (structured values + reference ranges + PDF report) against the order.
- FR-94: Critical-value auto-alert: push to ordering doctor + patient + lab medical director within defined SLA (e.g., 15 min).
- FR-95: Historical trend view for repeat tests (e.g., HbA1c over time) surfaced to patient and doctor.

### 6.7 Super Admin
- FR-110: Provider verification workflow (submit → review → approve/reject/request more info).
- FR-111: Global configuration: commission rates, cancellation policy bounds, notification templates, supported payment methods — per country/region.
- FR-112: Fraud & risk queue: flagged reviews, suspicious cancellation patterns, payment disputes, duplicate accounts.
- FR-113: Full audit log viewer with filters (who accessed what patient data, when, why).
- FR-114: Platform-wide analytics dashboard (GMV, bookings, retention, churn, provider performance).
- FR-115: Content moderation for reviews/profile photos/bios.
- FR-116: Impersonation ("login as") for support purposes, itself fully audit-logged and time-boxed.

### 6.8 Cross-Cutting
- FR-130: Notifications across push/SMS/email/WhatsApp with per-user channel preference and quiet hours.
- FR-131: Multi-language support (Arabic/English minimum), RTL layout.
- FR-132: Insurance integration: eligibility check, claim submission stub, co-pay calculation.
- FR-133: Telehealth video visit (WebRTC-based) with in-call chat and e-prescription issuance mid-call.

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | P95 API response < 300ms for read endpoints; < 800ms for booking write transactions; search results < 1s. |
| **Availability** | 99.9% uptime for core booking/payment services (≈8.7h downtime/year budget); 99.5% for reporting/analytics services. |
| **Scalability** | Support 10x growth in bookings/year without architecture rewrite; horizontal scaling of stateless services. |
| **Offline tolerance** | Mobile apps cache the last-viewed schedule/booking state; queued actions (booking, cancel) sync on reconnect with conflict resolution. |
| **Localization** | Full Arabic/English parity; currency/date formatting per locale; RTL-safe UI. |
| **Accessibility** | WCAG 2.1 AA on web dashboards; mobile apps meet platform accessibility guidelines (screen reader labels, min tap target 44px). |
| **Data durability** | Point-in-time recovery for transactional DB; RPO ≤ 5 min, RTO ≤ 30 min. |
| **Security** | See Section 22. |
| **Compliance** | See Sections 23–24. |
| **Auditability** | Every read/write to PHI (Protected Health Information) is logged immutably. |
| **Interoperability** | API-first; support HL7 FHIR-compatible export for lab/prescription data as a future-proofing measure. |
| **Maintainability** | Modular microservices (Section 28); contract-tested APIs; independent deploy per service. |
| **Observability** | Centralized structured logging, distributed tracing (per-request correlation ID across all services), real-time alerting on SLA breach. |

---

## 8. Business Rules

1. A booking is not "confirmed" until either payment succeeds or the clinic's pay-at-clinic policy is explicitly accepted by the patient.
2. A doctor cannot be double-booked across affiliations — availability is a single source of truth shared across all clinic calendars.
3. A prescription can only be issued by a Doctor role-membership that is verified and currently active (not suspended).
4. A pharmacy cannot mark an order "fulfilled" without decrementing matching inventory quantities.
5. Controlled substances require a two-step pharmacist confirmation and cannot be fulfilled via pure auto-accept flows.
6. A patient can only review a Doctor/Clinic/Pharmacy/Lab after a status-"completed" encounter tied to their account.
7. Cancellation fees escalate the closer to appointment time per the tiered policy (Section 21), configurable within Super-Admin-defined min/max bounds per region — clinics cannot set fees outside those bounds.
8. Lab critical values must notify the ordering doctor within the SLA regardless of the patient's notification preferences (safety override).
9. No-show is auto-recorded if neither patient check-in nor doctor visit-start occurs within a grace window (default 15 min) of the slot start.
10. Refunds route back to the original payment method by default; store-credit alternative requires explicit patient opt-in.
11. All PHI access outside of a direct care relationship requires either patient consent or a documented Super Admin support ticket (impersonation), and is always audit-logged.
12. A provider account under active fraud investigation is auto-hidden from search but remains accessible to existing patients until resolution.

---

## 9. Appointment Booking Workflow

**Design goal: search-to-confirmed in ≤ 4 taps for a returning patient.**

1. Patient searches (specialty/symptom/location) → results ranked by relevance + availability + rating.
2. Patient selects doctor → sees next available slots inline on the profile (no extra navigation).
3. Patient taps a slot → mini-checkout sheet appears (visit type, price, policy summary) — **no separate page load**.
4. Patient confirms → if online payment required, payment sheet appears inline; if pay-at-clinic, one-tap confirm.
5. System places a **soft hold** on the slot for 5 minutes during payment to prevent double-booking races.
6. On success: booking status = `CONFIRMED`; confirmation pushed via preferred channel; calendar invite (.ics) attached.
7. Reminders auto-scheduled: 24h before, 2h before (configurable per region).
8. Day-of: patient checks in (QR code at clinic, or auto-check-in for video visit on join) → doctor starts visit → visit closes → encounter recorded.

**State machine — Appointment:**
```
DRAFT → HELD (payment pending, 5-min TTL) → CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED
                 |                              |             |
                 → EXPIRED (TTL lapsed)          → CANCELLED   → NO_SHOW
                                                  → RESCHEDULED (creates new DRAFT/CONFIRMED, links old as SUPERSEDED)
```

**Edge cases handled:**
- Two patients tap the same slot simultaneously → optimistic lock on slot resource; second request gets "slot just taken, here are alternatives."
- Doctor cancels after patient paid → automatic full refund + priority rebooking suggestions + apology notification.
- Patient's payment succeeds but confirmation write fails (network partition) → idempotency key on payment ensures no double-charge; reconciliation job auto-heals booking status within 60s.

---

## 10. Pharmacy Workflow

**Design goal: doctor issues Rx → patient receives medicine, with zero re-entry of prescription data.**

1. Doctor issues structured e-Prescription at visit close (linked to the encounter).
2. Patient's app shows "Send to Pharmacy" — one tap, choose **Nearest / Preferred / Search** pharmacy.
3. Selected pharmacy receives order in a real-time queue: sees Rx, patient's known allergies (if permissioned), substitution rules.
4. Pharmacy system auto-checks inventory: 
   - If fully in stock → pharmacist confirms price → order moves to `ACCEPTED`.
   - If controlled substance → additional confirmation step required before acceptance.
   - If partial/no stock → pharmacist proposes substitution or partial fulfillment; patient approves/declines in-app.
5. Patient pays in-app (or COD) → pharmacy prepares order → hands to courier or marks ready for pickup.
6. Order closes → inventory decremented → encounter record updated with dispensed-medication log (visible in patient's unified health record).

**State machine — Pharmacy Order:**
```
RECEIVED → UNDER_REVIEW → (ACCEPTED | SUBSTITUTION_PROPOSED | REJECTED)
ACCEPTED → PAID → PREPARING → (OUT_FOR_DELIVERY | READY_FOR_PICKUP) → FULFILLED
SUBSTITUTION_PROPOSED → (PATIENT_APPROVED → ACCEPTED) | (PATIENT_DECLINED → REJECTED)
Any pre-FULFILLED state → CANCELLED
```

**Edge cases:** stock changes between "in stock" display and order acceptance (race) → pharmacy must re-confirm within 2 minutes or auto-flip to substitution flow; expired/near-expiry Rx (e.g., >30 days old) blocked from fulfillment without doctor re-authorization.

---

## 11. Laboratory Workflow

**Design goal: minimize friction between "test ordered" and "result seen," support both home and branch collection.**

1. Order created — either doctor-issued (from a visit) or patient self-requested (from an open test catalog).
2. Patient chooses: **Home Collection** (schedule window, address) or **Branch Visit** (pick nearest branch + slot).
3. For home collection: system assigns/optimizes phlebotomist route; patient gets ETA window + tracking.
4. Phlebotomist collects sample → scans/generates barcode → sample enters chain-of-custody log (collected → in-transit → received-at-lab → in-processing → resulted).
5. Lab technician enters/uploads results against the order (structured fields + optional PDF).
6. System runs a critical-value check against reference ranges:
   - If critical → immediate push/SMS/call-flag to ordering doctor + patient + lab medical director, bypassing quiet hours (safety override).
   - If normal → standard notification, result appears in patient's unified record, linked to originating visit if doctor-ordered.
7. Doctor (if applicable) is notified results are ready for review; can annotate/interpret.

**State machine — Lab Order:**
```
ORDERED → COLLECTION_SCHEDULED → SAMPLE_COLLECTED → IN_TRANSIT → RECEIVED_AT_LAB → PROCESSING → RESULT_READY → RELEASED
                                                                                                      |
                                                                                                → RESULT_READY(CRITICAL) → ESCALATED → RELEASED
Any pre-RESULT_READY state → CANCELLED (patient or lab initiated, per policy)
```

**Edge cases:** sample compromised/rejected in transit → auto-trigger re-collection scheduling with no extra charge to patient if lab-caused; result values outside instrument's valid range → flagged for manual technician review before release (never auto-released un-reviewed).

---

## 12. Payment Workflow

**Design goal: one payment ledger and rules engine shared by booking, pharmacy, and lab — not three bolted-on payment flows.**

Core concepts:
- **PaymentIntent** — created at the moment of checkout for any order type (booking/pharmacy/lab); carries amount, currency, payer, payee(s), and split rules (platform commission vs. provider net).
- **Hold vs. Capture** — supports authorize-now/capture-later (useful for pay-at-clinic where the deposit is authorized but captured only after visit completion).
- **Splits** — a single PaymentIntent can allocate to multiple payees (e.g., platform commission + doctor net + clinic facility fee) — computed via a rules table, not hardcoded percentages.
- **Refunds** — full/partial, always tied to the originating PaymentIntent, following cancellation-policy fee deduction rules.
- **Wallet** — optional in-app wallet for store credit (refunds-as-credit, promos); wallet balance is not real money custody beyond regulatory float limits — governed by local e-money regulations.

**State machine — Payment:**
```
CREATED → AUTHORIZED → CAPTURED → SETTLED
              |             |
              → VOIDED       → REFUNDED (full) | PARTIALLY_REFUNDED
              → FAILED (retry allowed, capped at 3 attempts)
```

**Reconciliation:** nightly settlement job matches CAPTURED payments against provider payouts; discrepancies raise a Super Admin finance-queue ticket automatically.

**Edge cases:** payment gateway timeout with unknown outcome → idempotency key + async webhook reconciliation prevents double charge; currency/FX for cross-border cards → settle in platform's base currency, display patient-facing amount in local currency at time of charge.

---

## 13. Notification Workflow

**Design goal: a rules engine, not a message blaster.**

- Every notifiable event (booking confirmed, Rx ready, lab critical value, payment failed, doctor running late, etc.) is classified by **Priority Tier**: `SAFETY_CRITICAL`, `TRANSACTIONAL`, `INFORMATIONAL`, `MARKETING`.
- **Channel fallback chain** per tier: 
  - `SAFETY_CRITICAL` (e.g., lab critical value): Push → if unread in 5 min → SMS → if unread in 15 min → automated voice call to doctor; bypasses quiet hours and user mute settings.
  - `TRANSACTIONAL` (booking confirmed, payment receipt): Push → SMS fallback if push fails to deliver.
  - `INFORMATIONAL` (reminder, review request): Push only, respects quiet hours.
  - `MARKETING` (promotions): opt-in only, respects quiet hours and frequency caps.
- User-configurable channel preferences (WhatsApp/SMS/Email/Push) apply to all tiers except `SAFETY_CRITICAL`.
- Templates are managed centrally by Super Admin (localized per language) — not hardcoded per service, so copy changes don't require redeploys.

---

## 14. Dashboard Features by Role

### Patient (Mobile-first, web companion)
Home (upcoming appointments, quick-rebook), Search/Discover, Health Record (visits/Rx/labs/allergies), Family Profiles, Payments/Wallet, Notifications Center, Reviews given.

### Doctor (Web primary, mobile companion)
Unified Calendar (all affiliations), Today's Queue, Patient Chart view, Rx/Lab-order composer, Payout Ledger, Reviews received, Availability manager.

### Clinic Admin (Web)
Multi-branch overview, Doctor roster & scheduling, Walk-in registration, Room/resource management, Settlement reports, Staff permission management, Clinic-level policy config (within bounds).

### Pharmacy (Web + tablet for counter use)
Incoming Order Queue (real-time), Inventory management, Fulfillment tracking (prep → delivery/pickup), Payout ledger, Controlled-substance audit log.

### Laboratory (Web + mobile for phlebotomists)
Order Queue, Collection Scheduling/Routing (map view for phlebotomists), Sample Chain-of-Custody tracker, Result Entry/Upload, Critical-Value Alert Center, Payout ledger.

### Super Admin (Web)
Platform KPI Dashboard (GMV, bookings, retention), Provider Verification Queue, Fraud/Risk Queue, Policy Configuration (commission, cancellation, regions), Audit Log Explorer, Content Moderation, Support Impersonation tool, Financial Reconciliation view.

---

## 15. Database Design (ERD-level)

**Core entities and relationships (conceptual):**

```
User (1) ───< RoleMembership >─── (1) Role  [Patient|Doctor|ClinicStaff|PharmacyStaff|LabStaff|SuperAdmin]

Patient (1) ───< FamilyLink >─── (M) Patient            (dependents)
Patient (1) ───< HealthRecord (1) ───< Encounter (M)

Doctor (1) ───< DoctorClinicAffiliation >─── (M) Clinic
DoctorClinicAffiliation (1) ───< AvailabilitySlot (M)

Clinic (1) ───< Branch (M) ───< Room/Resource (M)

Appointment (M) ─── (1) AvailabilitySlot
Appointment (M) ─── (1) Patient
Appointment (M) ─── (1) DoctorClinicAffiliation
Appointment (1) ─── (0..1) Encounter
Appointment (1) ─── (0..1) PaymentIntent

Encounter (1) ───< Prescription (M) ───< PrescriptionItem (M) ─── (1) DrugCatalogItem
Encounter (1) ───< LabOrder (M) ───< LabOrderItem (M) ─── (1) TestCatalogItem

Prescription (1) ─── (0..M) PharmacyOrder ───< PharmacyOrderItem (M) ─── (1) InventoryItem
PharmacyOrder (M) ─── (1) Pharmacy(Branch)
PharmacyOrder (1) ─── (0..1) PaymentIntent

LabOrder (1) ─── (0..M) LabFulfillment ───< SampleCustodyEvent (M)
LabFulfillment (M) ─── (1) Laboratory(Branch)
LabFulfillment (1) ─── (0..1) PaymentIntent
LabFulfillment (1) ───< LabResult (M) ─── (1) TestCatalogItem  [value, unit, ref_range, flag]

PaymentIntent (1) ───< PaymentSplit (M) ─── (1) Payee [Doctor|Clinic|Pharmacy|Lab|Platform]
PaymentIntent (1) ───< RefundTransaction (M)

Review (M) ─── (1) Encounter [verified-visit constraint]
Review (M) ─── (1) TargetEntity [Doctor|Clinic|Pharmacy|Lab]

AuditLogEntry (M) ─── (1) User (actor) ─── (0..1) Patient (subject) ─── (1) ResourceType/ResourceId

NotificationEvent (M) ─── (1) User (recipient) ─── (1) PriorityTier
```

**Key tables (representative, not exhaustive):**

`users, role_memberships, patients, family_links, doctors, clinics, clinic_branches, doctor_clinic_affiliations, availability_slots, rooms, appointments, encounters, drug_catalog, prescriptions, prescription_items, pharmacies, pharmacy_branches, inventory_items, pharmacy_orders, pharmacy_order_items, test_catalog, lab_orders, lab_order_items, laboratories, lab_branches, lab_fulfillments, sample_custody_events, lab_results, payment_intents, payment_splits, refund_transactions, wallets, wallet_transactions, reviews, notification_events, notification_templates, audit_log_entries, provider_verification_requests, policy_configs (region-scoped), fraud_flags.

**Design notes:**
- `HealthRecord` is a durable append-only aggregate — never overwritten, only extended (immutability supports both audit and clinical trust).
- `PaymentIntent` decoupled from order-type tables via polymorphic reference (`payable_type`, `payable_id`) so booking/pharmacy/lab share one payment engine.
- `policy_configs` is region/country-scoped so cancellation fees, commission %, and notification rules are data, not code.
- Soft-delete only for PHI-adjacent tables (never hard-delete health data); hard-delete permitted for non-PHI operational data per retention policy.

---

## 16. API Design (REST, versioned `/v1`)

**Conventions:** JSON:API-style resource naming, cursor-based pagination, idempotency keys required on all POST financial/booking endpoints, correlation-id header on every request for tracing.

### Identity
- `POST /v1/auth/otp/request`
- `POST /v1/auth/otp/verify`
- `GET /v1/me` — current user + role memberships
- `POST /v1/me/roles/switch`

### Search & Discovery
- `GET /v1/search/doctors?specialty=&lat=&lng=&radius=&price_max=&insurance=&available_from=`
- `GET /v1/doctors/{id}` — profile + affiliations + next slots

### Booking
- `POST /v1/appointments/hold` — soft-hold a slot (idempotent, 5-min TTL)
- `POST /v1/appointments/{id}/confirm` — attach payment, confirm
- `POST /v1/appointments/{id}/cancel`
- `POST /v1/appointments/{id}/reschedule`
- `GET /v1/appointments?patient_id=&status=`

### Encounter / EMR
- `POST /v1/encounters/{id}/close`
- `GET /v1/patients/{id}/health-record` (permission-scoped)

### Prescriptions
- `POST /v1/prescriptions` (doctor-issued, linked to encounter)
- `POST /v1/prescriptions/{id}/send-to-pharmacy`
- `GET /v1/pharmacy-orders?pharmacy_id=&status=`
- `POST /v1/pharmacy-orders/{id}/accept | /reject | /propose-substitution`
- `POST /v1/pharmacy-orders/{id}/fulfill`

### Lab
- `POST /v1/lab-orders` (doctor-issued or self-requested)
- `POST /v1/lab-orders/{id}/schedule-collection`
- `POST /v1/lab-fulfillments/{id}/custody-events`
- `POST /v1/lab-fulfillments/{id}/results`
- `GET /v1/patients/{id}/lab-results`

### Payments
- `POST /v1/payment-intents` (payable_type, payable_id, amount)
- `POST /v1/payment-intents/{id}/capture`
- `POST /v1/payment-intents/{id}/refund`
- `GET /v1/providers/{id}/payouts`

### Notifications
- `POST /v1/notifications/dispatch` (internal service-to-service)
- `PATCH /v1/me/notification-preferences`

### Admin
- `GET /v1/admin/verification-requests`
- `POST /v1/admin/verification-requests/{id}/approve | /reject`
- `PATCH /v1/admin/policy-configs/{region}`
- `GET /v1/admin/audit-log?actor_id=&subject_patient_id=&from=&to=`
- `GET /v1/admin/fraud-flags`

All endpoints return standard error envelope: `{ error: { code, message, correlation_id } }`; rate-limited per API key/user with 429 + `Retry-After`.

---

## 17. Permission Matrix (RBAC)

Legend: **C**reate, **R**ead, **U**pdate, **D**elete, **–** none. Scoped to "own/affiliated" records unless noted "ALL".

| Resource | Patient | Doctor | Clinic Admin | Pharmacy Staff | Lab Staff | Super Admin |
|---|---|---|---|---|---|---|
| Own profile | CRUD | CRUD | CRUD | CRUD | CRUD | R(ALL) |
| Own Health Record | R | R (own patients, visit-linked) | – | R (Rx-linked only) | R (order-linked only) | R(ALL, audited) |
| Appointment (own) | CRU (cancel/reschedule) | RU (own schedule) | CRUD (own clinic) | – | – | RUD(ALL) |
| Availability Slots | R | CRUD (own) | CRUD (affiliated doctors) | – | – | R(ALL) |
| Prescription | R (own) | C (issue), R (own patients) | R (affiliated) | R (routed to them) | – | R(ALL, audited) |
| Pharmacy Order | C (send), R (own) | – | – | RU (own pharmacy) | – | R(ALL) |
| Lab Order | C (self-request), R (own) | C (issue), R (own patients) | – | – | RU (own lab) | R(ALL) |
| Lab Result | R (own) | R (own patients) | – | – | CRU (own lab) | R(ALL, audited) |
| Payment/Payout | R (own) | R (own payouts) | R (own clinic) | R (own pharmacy) | R (own lab) | CRUD(ALL) |
| Reviews | C (post-visit only), R | R | R | R | R | RUD(ALL, moderation) |
| Provider Verification | – | R (own status) | R/C (own submission) | R/C (own submission) | R/C (own submission) | CRUD(ALL) |
| Policy Config | – | – | R (own bounds) | R (own bounds) | R (own bounds) | CRUD(ALL) |
| Audit Log | – | – | – | – | – | R(ALL) |
| Fraud Flags | – | – | – | – | – | CRUD(ALL) |

**Notes:**
- "Read own Health Record" for Doctor/Pharmacy/Lab is always **scoped to encounters they are party to** — a doctor cannot browse a patient's full history unless there's an active care relationship (current or past visit), and pharmacy/lab access is limited to what's clinically necessary for the specific order (minimum-necessary principle).
- Super Admin PHI reads are **always audit-logged with a reason code**, even though technically unrestricted.

---

## 18. State Machines (Consolidated Reference)

Already detailed inline per workflow (Sections 9–12). Additional cross-cutting state machines:

**Provider Verification:**
```
SUBMITTED → UNDER_REVIEW → (APPROVED → LIVE) | (REJECTED) | (INFO_REQUESTED → SUBMITTED)
LIVE → SUSPENDED (fraud/complaint) → (REINSTATED → LIVE) | (TERMINATED)
```

**Review/Rating:**
```
ELIGIBLE (post-COMPLETED encounter) → SUBMITTED → PUBLISHED
                                          → FLAGGED (reported) → (UPHELD → REMOVED) | (DISMISSED → PUBLISHED)
```

**Fraud Flag:**
```
RAISED (auto or manual) → INVESTIGATING → (CONFIRMED → ACTION_TAKEN) | (DISMISSED)
```

---

## 19. Edge Cases

- Patient books with two different phone numbers → duplicate-account detection via national-ID hash match at verification; accounts offered merge on confirmation.
- Doctor is double-booked due to a manual clinic-side override → system blocks with hard conflict error; clinic must explicitly cancel one appointment first (no silent overwrite).
- Pharmacy inventory sync fails silently (integration outage) → system auto-suppresses "confirmed in stock" claims and falls back to "pharmacist will confirm" messaging after a defined staleness threshold.
- Lab result value is physiologically impossible (data entry error) → system blocks release, flags for mandatory technician re-check.
- Patient's payment succeeds, but the visit is a video call and the doctor never joins → auto-refund after grace period + doctor no-show strike recorded.
- Multiple concurrent refund requests on the same PaymentIntent → refund total capped at PaymentIntent's captured amount; second request auto-adjusted/rejected.
- Family-linked dependent (child) turns 18 → system auto-prompts to convert linked profile into an independent account; access downgrades from full-guardian-control to standard adult privacy defaults.
- Provider account under investigation still has active future bookings → bookings honored unless patient safety risk is confirmed; if confirmed, forced-cancel with full refund + proactive patient notification.

---

## 20. Exception Handling

| Failure | Handling Strategy |
|---|---|
| Payment gateway timeout | Idempotency key prevents double charge; async webhook reconciles final state; UI shows "confirming payment" state, not a hard failure, for up to 60s. |
| Third-party SMS/notification provider down | Automatic failover to secondary provider; safety-critical alerts additionally attempt voice-call channel. |
| Database write partial failure mid-booking | Saga-style compensation: if slot-hold succeeds but payment fails, hold auto-releases after TTL; no orphaned "confirmed" states without a successful payment or explicit pay-at-clinic acknowledgment. |
| Lab integration (instrument) sends malformed result | Quarantine the result record, alert lab admin, block auto-release, require manual technician correction. |
| Duplicate webhook delivery (payment provider retries) | All webhook handlers are idempotent, keyed by provider event ID. |
| Service outage (any microservice) | Circuit breakers + graceful degradation — e.g., if Notification service is down, booking still completes, notification queues for retry. |

---

## 21. Cancellation Policies (Tiered, Configurable)

Default tiers (bounds configurable per region by Super Admin; clinics/pharmacies/labs may set within bounds):

| Time before appointment | Patient-initiated cancellation fee | Refund |
|---|---|---|
| > 24 hours | 0% | 100% |
| 6–24 hours | 10% of visit price | 90% |
| 1–6 hours | 25% of visit price | 75% |
| < 1 hour / no-show | 100% (no refund) | 0% |

- Provider-initiated cancellation (doctor/clinic cancels): always 100% refund + priority rebooking offer, regardless of timing.
- Repeated no-shows (3 within 90 days) trigger a **patient reliability flag**: future bookings require pre-payment (no pay-at-clinic option) until reliability score recovers.
- Pharmacy/Lab order cancellation: free before `ACCEPTED`/`SAMPLE_COLLECTED` respectively; after that, provider may deduct actual incurred cost (e.g., prepared medication, dispatched phlebotomist) as a partial fee, capped at a Super-Admin-defined ceiling.
- Emergency/medical-exception override: Super Admin support can waive any fee with a documented reason (fully audit-logged).

---

## 22. Security Requirements

- **Authentication:** OTP + optional biometric (mobile) for patients; mandatory MFA (OTP + password) for Doctor/Clinic/Pharmacy/Lab/Super Admin accounts.
- **Authorization:** RBAC enforced at the API gateway layer AND service layer (defense in depth) — never trust client-side role claims alone.
- **Transport:** TLS 1.2+ everywhere; certificate pinning on mobile apps.
- **Data at rest:** AES-256 encryption for all PHI-containing tables/columns; field-level encryption for highly sensitive fields (national ID, insurance policy number).
- **Secrets management:** centralized vault (no secrets in code/config repos); automatic rotation.
- **API security:** rate limiting, WAF in front of public endpoints, strict input validation/schema enforcement, protection against injection/XSS/CSRF.
- **Session management:** short-lived access tokens (JWT, ~15 min) + refresh tokens with rotation and revocation list.
- **Least privilege:** service-to-service auth via scoped mTLS/service tokens; no shared "god" API keys.
- **Vulnerability management:** scheduled penetration testing (at least annual + after major releases), dependency-vulnerability scanning in CI/CD, responsible-disclosure program.
- **Impersonation/support access:** time-boxed, reason-coded, fully audit-logged, requires secondary approval for PHI-heavy actions.

## 23. Privacy Requirements

- **Consent management:** explicit consent capture for data sharing beyond direct care (e.g., research/analytics use of de-identified data), revocable at any time.
- **Minimum necessary access:** providers see only what's clinically relevant to their specific encounter/order, not a patient's entire history by default.
- **Data portability:** patient can export their full health record (structured + PDF) at any time.
- **Right to erasure (bounded):** patients can request account deletion; PHI subject to legal retention requirements is anonymized rather than deleted, with clear disclosure of this distinction.
- **Third-party data sharing:** no PHI shared with advertisers or unrelated third parties; insurance-eligibility integrations are consent-gated and purpose-limited.
- **Children's data:** dependent profiles under guardian control until age of majority, per Business Rule in Section 19.
- **Privacy-by-design reviews:** any new feature touching PHI requires a privacy impact assessment before release.

## 24. Medical Data Compliance Considerations

- Architecture designed to be adaptable to **HIPAA-equivalent** controls (access logging, encryption, breach notification workflow) and regional equivalents (e.g., Egypt's Personal Data Protection Law, GCC health-data regulations) — compliance mapping should be finalized with regional legal counsel, but the technical foundation (audit logs, consent, encryption, minimum-necessary access) is built in from day one, not retrofitted.
- **HL7 FHIR-ready data model** for lab results and prescriptions eases future interoperability with national health information exchanges.
- Controlled-substance prescriptions follow local pharmacy-board rules (e.g., mandatory pharmacist verification, quantity limits, reporting to national drug-monitoring systems where required).
- Breach notification workflow: detection → containment → regulator/patient notification within legally mandated windows → post-incident report, all orchestrated as a defined Super Admin runbook, not ad hoc.

## 25. Audit Logging

- Every PHI read/write logged immutably with: actor (user + role-membership), action, resource type/id, subject patient id, timestamp, source IP, reason code (for out-of-context access), correlation id.
- Audit logs are **append-only** (write-once storage), separate from operational databases, retained per compliance requirement (commonly 6–7 years for health records).
- Automated anomaly detection over audit logs (e.g., a doctor account reading unusually many unrelated patient records) feeds directly into the Fraud/Risk Queue (Section 6.7).
- Super Admin has a searchable Audit Log Explorer (Section 16 API) with filters by actor, subject, date range, resource type.

## 26. Reporting & Analytics

- **Patient-facing:** personal health trends (e.g., lab value history charts), spending summary.
- **Doctor-facing:** visit volume, patient retention, revenue trend, rating trend.
- **Clinic-facing:** occupancy rate per room/doctor, revenue by service line, no-show rate, staff performance.
- **Pharmacy-facing:** order volume, fulfillment SLA, top-moving SKUs, stock-out frequency.
- **Lab-facing:** turnaround time (order → result), critical-value response time, sample rejection rate.
- **Super Admin/Platform:** GMV, take-rate realized, cohort retention, marketplace liquidity (fill rate), CAC/LTV by acquisition channel, regional performance breakdown, provider churn.
- All analytics built on a de-identified/aggregated **data warehouse** fed by CDC (change-data-capture) from operational databases — analytics workloads never query production transactional DBs directly.

## 27. Scalability Strategy

- **Stateless services** behind a load balancer, horizontally auto-scaled on CPU/queue-depth metrics.
- **Read replicas** for search/discovery and reporting workloads, separate from the transactional booking/payment write path.
- **Caching layer** (e.g., Redis) for doctor availability lookups and search results, with short TTL + event-driven invalidation on booking changes.
- **Asynchronous processing** via message queue (e.g., Kafka/RabbitMQ) for notifications, settlement jobs, analytics CDC — decouples slow/bursty work from the request path.
- **Database sharding readiness:** patient/provider data partitioned by region/tenant key from day one, even if starting on a single cluster, to ease future horizontal partitioning.
- **CDN** for static assets and doctor/clinic profile media.
- **Multi-region deployment path:** stateless services deployable per region; data residency respected for markets with local-storage requirements.

## 28. Modular Microservice Architecture

**Service boundaries (each independently deployable, owns its own database):**

1. **Identity Service** — accounts, role-memberships, auth, OTP.
2. **Provider Directory Service** — doctor/clinic/pharmacy/lab profiles, verification, search indexing.
3. **Scheduling Service** — availability slots, appointment state machine, holds.
4. **Encounter/EMR Service** — health record, encounters, clinical notes (highest sensitivity — strictest access controls).
5. **Prescription Service** — e-Rx issuance, drug catalog, pharmacy routing.
6. **Pharmacy Fulfillment Service** — inventory, order lifecycle, delivery/pickup.
7. **Lab Order Service** — order lifecycle, catalog, self-request flow.
8. **Lab Fulfillment Service** — collection scheduling, chain-of-custody, results, critical-value alerts.
9. **Payment Service** — PaymentIntents, splits, refunds, payouts, wallet.
10. **Notification Service** — rules engine, channel adapters, templates.
11. **Review/Rating Service** — verified reviews, moderation hooks.
12. **Fraud/Risk Service** — anomaly detection, flags, investigation workflow.
13. **Audit Service** — immutable log ingestion + query API.
14. **Analytics/Reporting Service** — CDC-fed warehouse + dashboards.
15. **Admin/Policy Configuration Service** — region-scoped rules for commission/cancellation/notification.

**Integration pattern:** synchronous REST for user-facing request/response; asynchronous events (booking.confirmed, prescription.issued, lab_result.critical, payment.captured, etc.) published to a shared event bus for cross-service reactions (e.g., Notification Service subscribes to nearly all events; Analytics Service subscribes to everything via CDC).

**API Gateway** in front of all services: authentication, rate limiting, routing, request/response logging, and RBAC pre-check before requests reach service layer.

---

## 29. Mobile UX Flows (Patient App — Primary Consumer Surface)

- **Onboarding:** phone OTP → optional profile completion (can defer) → land directly on Home/Search (no forced tutorial).
- **Search → Book:** single-screen search with inline filters (bottom sheet) → doctor card shows next slot directly in list (no need to open profile to see availability) → tap slot → inline checkout sheet → confirm. (Design goal from Section 9: ≤4 taps.)
- **Health Record:** tab-based (Visits / Prescriptions / Labs / Family) with a unified timeline view as the default landing state.
- **Rx-to-Pharmacy:** post-visit summary screen has a persistent "Send to Pharmacy" button; tapping shows nearest 3 pharmacies with live price/stock indicator before the patient commits.
- **Lab home-collection:** map-based slot picker with a visible ETA window; live phlebotomist tracking similar to a delivery-tracking UX pattern (familiar mental model).
- **Notifications Center:** grouped by priority tier visually (critical alerts pinned to top, distinct color treatment), not just reverse-chronological.
- **Offline behavior:** if connectivity drops mid-booking, the app queues the action locally, shows a clear "will complete when back online" state, and never silently fails.

## 30. Web Dashboard UX Flows (Doctor / Clinic / Pharmacy / Lab / Super Admin)

- **Shared shell pattern:** left nav (role-specific modules), top bar (context switcher for multi-role accounts, notifications, profile), main content area — consistent across all provider dashboards to reduce training time for staff who interact with multiple roles (e.g., a clinic owner who is also a doctor).
- **Doctor dashboard:** calendar-first landing page (not a generic "home" widget dashboard) since scheduling is the daily-driver task.
- **Clinic dashboard:** operations-first landing page — today's combined queue (online + walk-in) across all doctors/rooms.
- **Pharmacy dashboard:** queue-first landing page — incoming orders sorted by urgency/SLA countdown.
- **Lab dashboard:** split view — order queue (left) + map/route view for phlebotomists (right) on the collections-scheduling screen.
- **Super Admin dashboard:** KPI summary landing page with drill-down navigation into Verification Queue, Fraud Queue, Policy Config, Audit Explorer as distinct modules — designed for a small internal ops team, so information density is prioritized over onboarding-friendliness.
- **Cross-role design system:** shared component library (data tables, status badges per state-machine state, filter bars) ensures visual and behavioral consistency, reducing engineering duplication across five distinct dashboard products.

---

## Appendix: Implementation Priority (Suggested MVP Sequencing)

**Phase 1 (MVP):** Identity, Provider Directory, Scheduling, Payment (booking only), Notification (transactional tier), Patient/Doctor/Clinic dashboards, basic Review system.

**Phase 2:** Prescription Service + Pharmacy Fulfillment, Encounter/EMR unified record, Super Admin verification & policy config.

**Phase 3:** Lab Order + Lab Fulfillment (including home collection), Fraud/Risk Service, Audit Service maturity, Analytics/Reporting warehouse.

**Phase 4:** Wallet, insurance integration, telehealth video visits, HL7 FHIR interoperability layer, multi-region expansion.

This sequencing front-loads the highest-liquidity workflow (booking) to prove marketplace demand before investing in the more operationally complex pharmacy/lab supply chains.

---

*End of document. This specification is structured for direct handoff to engineering (API/DB sections), product (personas/journeys/stories), and design (UX flow sections) teams, with each section independently referenceable during sprint planning.*
