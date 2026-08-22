# Healthcare Super Platform — Product Discovery Document
### Prepared for: First Client Business Meeting
### Prepared by: Product Discovery Team (Product, Business Analysis, Healthcare SaaS Consulting, Enterprise Architecture, UX Research, Solution Architecture, Technical PM, Business Process, Medical Operations, QA Architecture)

---

## 1. Executive Summary

The client has described a **Healthcare Super Platform** connecting six participants — Patients, Doctors, Clinics, Pharmacies, Laboratories, and a Super Admin — around three core services: **Doctor Appointment Booking**, **Pharmacy Prescription Ordering**, and **Laboratory Booking**.

As described, the idea is a coherent starting concept, comparable in spirit to Vezeeta, Practo, Zocdoc, or Doctoralia, but expanded into a three-in-one "medical super app" rather than a booking-only marketplace. This is a strong and viable direction — this pattern (booking → prescription → diagnostics, all under one account) is exactly where mature markets in this space have moved, because it increases per-patient revenue and stickiness far beyond a single-service booking app.

However, **the idea as written is a product concept, not yet a buildable specification.** It describes the "happy path" for three workflows but does not yet answer the questions that determine cost, timeline, legal exposure, and whether the platform will actually work in the field. Specifically, we identified gaps in:

- **Identity and relationship modeling** (Can a doctor work at multiple clinics? Can a patient book for a family member? Who owns the patient relationship — the platform, the clinic, or the doctor?)
- **Financial mechanics** (deposits vs. full payment, refunds, no-shows, commission structure, pharmacy/lab payment timing, payout schedules)
- **Trust and safety** (what happens when a pharmacy claims a medicine is unavailable after accepting payment, what happens when lab results are abnormal/critical, how are bad actors — fraudulent clinics, fake reviews — handled)
- **Regulatory exposure** (this platform will hold Protected Health Information — prescriptions, lab results, diagnoses by implication — which triggers healthcare data-protection obligations regardless of country, and controlled-substance handling rules for the pharmacy module)
- **Operational reality** (what happens at 8pm when a clinic's front desk has gone home and a booking request arrives; what happens when a lab technician enters a wrong result; what happens when a doctor is genuinely running late and there is a full waiting room)

This document does not attempt to answer all of these questions unilaterally. Instead, **our job in this phase is to surface every open question, missing rule, and edge case that must be decided before a single screen is designed or a single line of code is written.** Section 10 (Discovery Questions) and Section 12 (Edge Cases) are the heart of this document — they are the agenda for the client workshop that should happen before scoping begins.

**Our recommendation:** treat this as a phased build (booking first, since it proves demand and liquidity fastest; pharmacy and lab layered in afterward once the core marketplace has real usage data), and resolve the open questions in this document — particularly around payments, cancellations, data ownership, and regulatory scope — before finalizing a fixed-price estimate or a hard delivery date.

---

## 2. Product Vision

**A single trusted destination where a patient can find the right doctor, book a visit, get a prescription filled, and get lab work done — without leaving the app, without re-explaining their situation three times, and without wondering whether the price they're being charged is fair.**

For providers (doctors, clinics, pharmacies, labs), the platform should feel less like "another app to manage" and more like a source of new patients and simplified administration — it should reduce their phone-call load and no-show losses, not add a new burden.

For the Super Admin (the platform operator), the vision is a business with three connected revenue lines (booking commission, pharmacy order commission, lab order commission) and a single operational console to run all of them.

---

## 3. Business Goals

| # | Goal | Why it matters | Illustrative success signal (to be defined precisely with client) |
|---|---|---|---|
| 1 | Prove booking-marketplace liquidity in a target city/region before expanding | Avoids over-building pharmacy/lab modules before there's patient demand | A meaningful share of listed doctors' slots get filled weekly |
| 2 | Reduce no-show rate below industry norm | No-shows are the single biggest source of doctor/clinic dissatisfaction with digital booking | Measurable drop vs. clinics' historical no-show rate |
| 3 | Convert booking users into pharmacy/lab users | This is the "super app" thesis — cross-sell drives revenue per user up | % of patients who use 2+ of the 3 services within 90 days |
| 4 | Build trust fast (reviews, verified providers) | Healthcare purchase decisions are trust-sensitive; a marketplace with no trust signal will not convert | Review coverage %, verified-provider %|
| 5 | Establish a defensible commission/revenue model across all three services | This is what makes the business fundable, not just usable | Take-rate achieved vs. target, per service line |
| 6 | Keep provider onboarding friction low | Supply-side growth is usually the harder side of a two-sided marketplace to grow | Time from provider signup to "live and bookable" |
| 7 | Avoid a regulatory or data-breach incident in year one | A single publicized health-data breach can end a healthcare startup | Zero reportable incidents; documented compliance posture in place before launch |

**Open discussion point for the client:** we've written these directionally; actual numeric targets depend on the launch city/country, competitive landscape, and available marketing budget — this should be a live discussion, not something we assume for you.

---

## 4. Stakeholders

| Stakeholder | Primary interest | What they need from this platform |
|---|---|---|
| **Patients** | Fast, trustworthy access to care | Simple booking, transparent pricing, one place for their health interactions |
| **Doctors** | More patients, less admin overhead | Full/predictable schedule, minimal no-shows, gets paid reliably, doesn't want to "manage marketing" |
| **Clinic owners/admins** | Revenue and operational efficiency | Fewer phone calls, filled schedule, simple front-desk workflow, clear settlement reports |
| **Pharmacies** | Order volume, no dispensing errors | Clear, structured prescriptions; ability to reject/substitute without penalty; reliable payment |
| **Laboratories** | Order volume, sample integrity | Clear test requests, ability to manage capacity, simple result delivery |
| **Platform investors/founders** | A fundable, defensible business | Unit economics that work, a plan that shows regulatory and operational risk is understood, not ignored |
| **Platform operations team (Super Admin users)** | Ability to run the business day to day | Tools to onboard/verify providers, resolve disputes, monitor fraud, configure policy without needing a code deploy every time |
| **Regulators / medical syndicates / data protection authorities** (indirect, but real) | Patient safety and data protection | Auditable data handling, licensed-provider verification, safe handling of controlled substances and lab results |
| **Payment processors / banks** | Fraud-free, chargeback-manageable transaction volume | Clear transaction categorization (medical services), refund policy clarity |
| **Courier/delivery partners** (if pharmacy delivery is in scope) | Clear handoff process | Defined pickup/delivery SLAs and responsibilities |

---

## 5. User Types

### 5.1 Patient
The consumer. May act on their own behalf or on behalf of a dependent (child, elderly parent). Uses the platform to find providers, book, pay, receive prescriptions and lab results.

**Open question flagged here:** the brief never defines whether a "Patient" account can represent a family, or whether each family member needs their own account. This materially changes onboarding, data model, and even legal consent structure (a parent consenting for a child is a different legal act than a patient consenting for themselves). See Discovery Questions §10.1.

### 5.2 Doctor
A licensed medical professional. May work independently, or be affiliated with one or more clinics. Manages their own availability (or has it managed by clinic staff — undefined in the brief). Issues prescriptions and (implicitly) may order lab tests.

### 5.3 Clinic (represented by Clinic Admin / Receptionist users)
An organization, not a person — but the brief's "Clinic Dashboard" implies at least one human operator role. The brief does not distinguish between a **Clinic Owner/Admin** (business/financial control) and a **Receptionist** (day-to-day accept/reject/reschedule actions) — these are typically different permission levels in real clinics and should probably be modeled separately.

### 5.4 Pharmacy (represented by Pharmacy Staff/Owner users)
Receives prescriptions, quotes price and availability, fulfills orders. Same owner-vs-staff distinction likely applies as with clinics.

### 5.5 Laboratory (represented by Lab Staff/Manager users)
Receives test requests, quotes price/date, performs analysis, delivers results. Same owner-vs-staff distinction likely applies.

### 5.6 Super Admin
The platform operator's internal team. Not described at all in the brief beyond being named — this is a significant gap. A platform of this complexity typically needs several internal roles (see §10.6), not one undifferentiated "Super Admin."

### 5.7 (Missing from brief, flagged as a likely gap) Courier/Delivery Agent
If pharmacy delivery is a real fulfillment path (the brief mentions pharmacies but not explicitly delivery mechanics), a delivery-agent role/interface is likely needed — even if it's just a simple status-update mobile view.

### 5.8 (Missing from brief, flagged as a likely gap) Phlebotomist / Home Sample Collector
The brief describes only in-lab or upload-prescription lab booking — it does not mention home sample collection, but this is a very common expectation in this market today. Flagged as a probable near-term addition (see §14).


---

## 6. Product Scope

### 6.1 In Scope (based on the brief, confirmed)
- Patient search/browse doctors by specialty
- Doctor profile (name, photo, clinic, rating, experience, fees, availability, location)
- Appointment booking (doctor → date → time → payment → confirmation)
- Clinic-side accept/reject/reschedule/cancel of bookings
- Deposit, full payment, cash, and online payment methods
- Prescription upload (with image quality check) after a doctor visit
- Pharmacy selection: specific / nearest / best offer
- Privacy-filtered prescription view for pharmacies (hidden phone number)
- Pharmacy quoting: price, available/unavailable/alternative medicines, prep time
- Patient accept/reject of pharmacy quote
- Laboratory analysis selection or prescription upload
- Lab quoting: price, date, instructions, expected result date
- Patient confirmation, booking code, queue number, QR code
- Lab result upload (PDF) and patient download

### 6.2 Explicitly Out of Scope for V1 (recommended, pending client confirmation)
We recommend the following be **explicitly excluded from V1** to keep the first release shippable, and revisited in Section 14 (Future Features):
- Telemedicine / video consultations
- Home doctor visits
- Home lab sample collection
- Insurance claim integration (beyond possibly storing a policy number)
- AI-based symptom checking or doctor recommendation
- Loyalty programs / subscriptions
- Multi-country / multi-currency operation
- Electronic prescribing directly from doctor to pharmacy without a patient-uploaded image step (this is actually a **strong recommended upgrade** — see §14 — but is a scope decision, not an assumed default)

### 6.3 Scope Items the Brief Leaves Ambiguous (must be decided, not assumed)
- Whether doctors can be **independent** (not attached to any clinic) or must always belong to a clinic
- Whether a clinic can have **multiple branches** and whether a doctor's schedule is per-branch
- Whether the **pharmacy prescription flow requires a completed platform booking first**, or whether a patient can upload a prescription from an external/offline doctor visit
- Whether the **lab flow requires a doctor's prescription**, or self-requested testing (e.g., a routine blood panel with no doctor involved) is allowed
- Whether **walk-in patients** (booked by phone or in person, not through the app) appear in the same Clinic Dashboard as app bookings

---

## 7. High-Level Modules

| Module | Core responsibility | Notes / gaps identified |
|---|---|---|
| **Identity & Access** | Account creation, login, role management (multi-role support) | Not mentioned in brief at all — foundational gap; see §10.1 |
| **Doctor/Clinic Directory** | Search, filter, profile display, ratings | Rating source/verification not defined |
| **Appointments** | Booking, accept/reject/reschedule/cancel, calendar | Core module; conflict/double-booking rules undefined |
| **Patients** | Patient profile, family/dependents, history | Family/dependent handling undefined |
| **Prescriptions** | Upload, image-quality check, routing to pharmacy | "Image quality check" needs a defined rejection/retry flow |
| **Pharmacy** | Quoting, accept/reject, fulfillment, sales record | Delivery mechanics undefined |
| **Laboratory** | Test selection, quoting, booking, result delivery | Result-review/critical-value handling undefined |
| **Payments** | Deposit/full, cash/online, refunds | Refund policy, commission mechanics, payout timing all undefined |
| **Notifications** | Confirmations, reminders, status updates | Channels (SMS/push/email/WhatsApp), urgency tiers undefined |
| **Reports/Analytics** | Sales records (pharmacy mentioned explicitly) | Not defined for other roles — likely needed for clinic/lab/admin too |
| **Admin/Super Admin** | Oversight, provider verification, dispute handling | Almost entirely undefined in the brief — major gap |
| **Reviews/Ratings** (implied by "Rating" field, not otherwise described) | Doctor rating mechanism | Not described: who can rate, when, is it verified-visit-only? |
| **(Gap) Trust & Safety / Fraud** | Fake reviews, fraudulent providers, no-show abuse | Not mentioned at all — flagged as necessary for any marketplace at scale |
| **(Gap) Audit Logging** | Who accessed what patient data, when | Not mentioned — likely a legal necessity given health data involved |

---

## 8. User Journeys

### 8.1 Patient — Booking Journey
Opens app → selects specialty → browses doctor list (name/photo/clinic/rating/experience/fee/availability/location) → selects doctor → selects date → selects time → selects payment method → confirms booking → **waits for clinic decision** (accept/reject/reschedule) → if accepted, receives confirmation and appears on "today's appointments."

**Journey gap flagged:** the brief does not describe what the patient experiences **while waiting** for clinic acceptance, nor what happens if the clinic never responds. A booking marketplace cannot leave this undefined — patients will abandon the platform if "book now" actually means "request and hope."

### 8.2 Patient — Pharmacy Journey
After a doctor visit → uploads prescription (image-quality checked) → adds optional notes → chooses specific/nearest/best-offer pharmacy → **waits for pharmacy quote** → receives price/available/unavailable/alternatives/prep-time → accepts or rejects → if accepted, order proceeds.

**Journey gap flagged:** "after visiting the doctor" implies this could be a doctor visited **outside the platform**. If so, the pharmacy module is really a standalone "upload any prescription" feature, which has different verification requirements (how do you know the prescription image is genuine and legally issued?) than one flowing directly from a platform-recorded doctor visit.

### 8.3 Patient — Laboratory Journey
Selects laboratory → chooses analyses or uploads prescription → **waits for lab reply** (price/date/instructions/expected result date) → confirms → receives booking code/queue number/QR code → (time passes) → laboratory uploads PDF results → patient downloads.

**Journey gap flagged:** no mention of abnormal/critical result handling, no mention of how the patient is notified that results are ready (push? email? do they have to open the app and check?), no mention of whether results are also shared with the ordering doctor.

### 8.4 Doctor Journey (not explicitly described in brief — inferred and flagged)
The brief describes bookings arriving in the **Clinic** Dashboard, not a Doctor Dashboard — this raises the question of whether doctors have their own login at all, or whether they operate entirely through clinic staff. This is a major open question (see §10.1) with significant UX and staffing implications, especially for independent doctors not affiliated with a clinic-run front desk.

### 8.5 Clinic/Receptionist Journey
Receives booking request in dashboard → accepts / rejects / reschedules / cancels → on accept, patient is notified and added to today's appointment list.

**Journey gap flagged:** no mention of walk-in patients, no mention of what happens to the doctor's calendar when a clinic reschedules (does the patient get to choose the new time, or is it assigned?), no mention of a **same-day/urgent** booking path.

### 8.6 Pharmacy Journey
Receives prescription (name, address, prescription, notes — phone hidden) → reviews → sends quote (price/available/unavailable/alternatives/prep time) → patient accepts/rejects → fulfills → sale recorded.

**Journey gap flagged:** no mention of how/when the pharmacy learns the patient's phone number if delivery coordination requires it, no mention of delivery vs. pickup, no mention of controlled-substance handling.

### 8.7 Laboratory Journey
Receives request (analyses list or prescription image) → sends quote (price/date/instructions/expected result date) → patient confirms → booking created → results uploaded as PDF.

**Journey gap flagged:** no mention of home sample collection, no mention of partial-panel results (some tests ready before others), no mention of what "confirms" requires (payment? just acknowledgment?).

### 8.8 Super Admin Journey (essentially absent from brief — flagged as a major gap)
The brief names "Super Admin" as a connected role but describes **zero workflows** for this role. At minimum, an enterprise platform of this shape needs Super Admin journeys for: provider onboarding/verification, dispute resolution, commission/policy configuration, fraud monitoring, and platform-wide reporting. This must be scoped before development, not treated as an afterthought — it is usually 15-20% of the total build effort on platforms like this.


---

## 9. Business Workflows

### 9.1 Appointment Workflow (as described, with gaps marked)
```
Patient selects specialty
   → Patient browses doctors
   → Patient selects doctor, date, time, payment method
   → Booking request created  [status: PENDING]
   → Appears in Clinic Dashboard
   → Clinic Admin/Receptionist: Accept | Reject | Reschedule | Cancel
        → Accept: patient notified, added to "today's appointments"  [status: CONFIRMED]
        → Reject: patient notified  [status: REJECTED] — **[GAP: is a reason required? is a refund automatic?]**
        → Reschedule: **[GAP: who proposes new time — clinic or patient? single offer or negotiation?]**
        → Cancel (post-accept): **[GAP: cancellation window/fee not defined]**
   → Visit occurs  **[GAP: no explicit "check-in" or "visit completed" state described]**
   → **[GAP: no defined trigger for when a booking is considered "done" vs. "no-show"]**
```

### 9.2 Prescription (Pharmacy) Workflow
```
Patient uploads prescription image
   → System checks image quality  **[GAP: what happens on failure — retry, manual review, reject outright?]**
   → Patient adds optional notes
   → Patient chooses: Specific Pharmacy | Nearest Pharmacy | Best Offer
   → Request reaches Pharmacy Dashboard (name, address, prescription, notes — phone hidden)
   → Pharmacy reviews and sends: price, available meds, unavailable meds, alternatives, prep time
   → Patient: Accept | Reject
        → Accept: order proceeds  **[GAP: payment happens here? before or after preparation?]**
        → Reject: **[GAP: can patient then try a different pharmacy with the same prescription? is there a limit?]**
   → **[GAP: no defined delivery/pickup mechanic]**
   → **[GAP: no defined "fulfilled/completed" trigger]**
   → Sale recorded in pharmacy dashboard
```

### 9.3 Laboratory Workflow
```
Patient selects laboratory
   → Chooses analyses OR uploads prescription
   → Request reaches Laboratory
   → Lab replies: price, available date, prep instructions, expected result date
   → Patient confirms  **[GAP: does confirming require payment now, or at the lab?]**
   → Booking created → booking code + queue number + QR code issued
   → **[GAP: no defined sample-collection confirmation step — how does the lab know the patient showed up?]**
   → Laboratory uploads PDF results
   → **[GAP: no defined critical-value/abnormal-result escalation]**
   → Patient downloads results
```

### 9.4 Payment Workflow (largely undefined in brief — this is a major gap)
The brief only states payment can be "Deposit, Full payment, Cash, Online" as options at booking time. It does **not** define:
- What triggers a deposit vs. requiring full payment (is this the clinic's choice, the platform's policy, or patient's choice?)
- What happens to a deposit if the clinic rejects the booking
- What happens to a deposit/payment if the patient doesn't show up
- How pharmacy and lab payments work at all — the brief mentions payment only for appointments, not for pharmacy orders or lab bookings, despite both clearly involving money changing hands
- Platform commission mechanics — how/when does the platform get paid, and by whom (patient markup, provider commission, both)?
- Refund process and timeline
- Provider payout schedule (daily/weekly/monthly, and via what method)

**This is the single largest gap in the entire brief and should be a primary discussion topic in the first client meeting.**

### 9.5 Cancellation Workflow (entirely undefined in brief)
No cancellation policy, fee structure, or time-based rule is mentioned anywhere in the brief for any of the three services. This must be defined before any payment logic can be built, since payment and cancellation are inseparable in practice.

### 9.6 Notification Workflow (entirely undefined in brief)
The brief implies notifications happen ("patient receives confirmation," "patient notified") but never defines the channel (push/SMS/email/WhatsApp), urgency handling (is a lab-critical-result notification treated the same as a promotional message?), or what happens if a notification fails to deliver.

---

## 10. Discovery Questions

**This section is the primary deliverable of this document.** These are the questions that should be walked through, module by module, in the client workshop — ideally with a decision recorded next to each one before scoping begins.

### 10.1 Identity, Accounts & Relationships
1. Can a patient book an appointment on behalf of another person (child, parent, spouse)?
2. If yes, is that a separate "dependent profile" under one account, or a fully separate account with a "booked by" relationship?
3. Does a Doctor have their own login/dashboard, or do all doctor-side actions happen through Clinic staff?
4. Can a Doctor work at more than one Clinic?
5. If yes, is their availability calendar shared/unified across clinics, or fully separate per clinic?
6. Can a Clinic have multiple physical branches?
7. If yes, is a doctor's schedule branch-specific?
8. Can a single person hold more than one role (e.g., a clinic owner who is also a treating doctor)?
9. Is there a difference between a Clinic **Owner/Admin** account and **Receptionist/Staff** accounts with limited permissions?
10. Same question for Pharmacy (Owner vs. Staff) and Laboratory (Manager vs. Technician)?
11. How are patients verified (phone OTP only? email? national ID for certain actions)?
12. How are Doctors verified as actually licensed (medical syndicate/license number check)? Who performs this check — automated, manual, or third-party?
13. How are Clinics, Pharmacies, and Labs verified as legitimate businesses (commercial registration, pharmacy license, lab accreditation)?
14. What happens to a patient's account and data if they stop using the app for years — is there a data retention/deletion policy?
15. Can a patient have accounts in multiple countries/regions if the platform expands, and is data segregated by region?

### 10.2 Doctor Directory & Search
16. What determines doctor ranking in search results — proximity, rating, availability, or a paid/sponsored placement?
17. Are "sponsored" or "featured" doctor placements part of the business model, and if so, must they be visually disclosed to patients?
18. Is the "Rating" field patient-submitted, and if so, who can submit a rating — anyone, or only patients with a completed visit?
19. Can a doctor or clinic respond publicly to a negative review?
20. Can reviews be edited or deleted, and by whom (patient, provider dispute process, Super Admin moderation)?
21. Is "Experience" (years) self-reported by the doctor, or verified against their license/syndicate registration?
22. How are "Fees" displayed — per visit type (first visit vs. follow-up), or a single flat fee per doctor?
23. Does fee vary by clinic if a doctor works at multiple clinics?
24. Is there a favorites/bookmark feature so patients can save preferred doctors?
25. Can patients filter by gender of doctor, language spoken, or insurance accepted?

### 10.3 Appointments
26. Can two patients be offered the same time slot simultaneously (race condition), and how is that resolved?
27. Is a booking "confirmed" the moment the patient pays, or only after the clinic explicitly accepts?
28. If payment happens before clinic acceptance, what happens to the money if the clinic rejects?
29. Can a clinic auto-accept certain doctors' bookings without manual review (to reduce patient wait-for-response friction)?
30. If a clinic proposes a reschedule, does the patient get to pick from alternate slots, or just accept/reject the one proposed?
31. Is there a maximum response time for a clinic to accept/reject a booking before it auto-expires or auto-cancels?
32. How is a "no-show" defined and recorded — does the clinic have to manually mark it, or is there a time-based auto-rule?
33. Can a patient book same-day/urgent appointments, and does the workflow differ from advance booking?
34. Can a patient book recurring appointments (e.g., monthly checkups, physiotherapy series)?
35. Is there a limit on how many active/future bookings a single patient can hold at once (to prevent slot-hoarding)?
36. Can walk-in (non-app) patients be entered into the same system by clinic staff, so the doctor's calendar stays accurate?
37. What happens if a doctor is unexpectedly unavailable (illness) on a day with confirmed bookings — who notifies affected patients, and what's the resolution path (auto-cancel, offer reschedule)?
38. Are appointment durations fixed per specialty, configurable per doctor, or configurable per visit type?
39. Is there a "running late" status a clinic can push to waiting patients?
40. Can a patient check in via the app (e.g., QR code at the clinic) or is check-in purely manual by front-desk staff?

### 10.4 Payments (Appointments)
41. Who decides deposit vs. full payment — the platform's policy, the clinic's choice per doctor, or the patient's choice at checkout?
42. If a deposit is taken, what percentage, and is it configurable per clinic/doctor/specialty?
43. What happens to a deposit if the clinic rejects the booking? Automatic full refund? Within what timeframe?
44. What happens to a deposit/payment if the patient no-shows? Forfeited, partially refunded, or fully refunded?
45. What happens to a deposit/payment if the patient cancels — and does the refund amount depend on how far in advance they cancel?
46. Is "Cash" payment tracked in the system at all, or is it purely an offline arrangement invisible to the platform (which would break settlement reporting)?
47. What online payment methods are required (cards, mobile wallets, buy-now-pay-later, bank transfer)?
48. Is there a platform commission on every booking, and is it visible to the patient (itemized) or absorbed by the provider?
49. How and how often are clinics/doctors paid out by the platform (daily, weekly, monthly; bank transfer, wallet)?
50. What happens with currency/payment if the platform expands to multiple countries?
51. Is there a maximum time window before an unpaid "pending payment" booking is auto-cancelled?
52. Are there different payment rules for first-time patients vs. returning/trusted patients?

### 10.5 Pharmacy Module
53. Is the pharmacy flow tied only to a prescription generated through this platform's own doctor visits, or can patients upload any prescription from any (offline) doctor?
54. If any prescription can be uploaded, how is prescription authenticity/validity verified — is it purely visual pharmacist judgment, or is there any automated check?
55. What exactly does "image quality check" reject — blur, missing signature/stamp, cropped edges, expired date? Is this automated (OCR-based) or a manual pharmacist step?
56. If the image fails quality check, can the patient re-upload immediately, or is there a cap on attempts?
57. Is there a maximum validity period for a prescription before a pharmacy can no longer act on it (many jurisdictions cap this, especially for controlled substances)?
58. How are controlled/scheduled medications (opioids, certain psychiatric medications) handled differently from standard prescriptions?
59. Does the platform maintain a medicine catalog/database that pharmacies map their inventory against, or does each pharmacy freely type in medicine names/prices?
60. When must the pharmacy learn the patient's phone number — is it revealed only after order acceptance, only for delivery coordination, or never (platform handles all comms)?
61. Does the "Best Offer" option compare live pharmacy quotes in real time, or standing/published prices? How long is a patient willing to wait for multiple pharmacies to respond before choosing "Best Offer"?
62. Is delivery in scope for V1, and if so, is it via pharmacy's own staff, a platform-integrated courier network, or patient pickup only?
63. Who is liable if a delivered medication is wrong, damaged, or expired — the pharmacy, the courier, or the platform?
64. What happens if a pharmacy accepts an order, then discovers a stock issue after the fact (before or during preparation)?
65. Is partial fulfillment allowed (some medicines available now, rest later), and if so, is that a single order or split into two?
66. Is there a price cap or price transparency rule to prevent a pharmacy from overcharging a captive/uploaded-prescription patient who can't easily compare?
67. Does the pharmacy's sales record feed into any tax/accounting reporting requirement in the target market?
68. Can a patient dispute a pharmacy transaction after the fact (wrong medicine dispensed), and what's the resolution workflow?

### 10.6 Laboratory Module
69. Is a doctor's prescription/order required to book certain lab tests, or can any test be self-requested by a patient directly?
70. (Regulatory) In the target market, are there tests that legally require a doctor's order (e.g., genetic testing, certain hormone panels)? Who is responsible for enforcing that rule?
71. Does "confirms" (patient confirms booking) require payment at that moment, or is payment collected at the lab in person?
72. What are the fasting/preparation instructions — are these standardized per test type in a platform-maintained catalog, or freely written by each lab?
73. Is home sample collection in scope for V1, or strictly in-branch visits?
74. How does the lab know a patient has physically arrived and had their sample taken — is there an explicit "sample collected" status, separate from "booking confirmed"?
75. What happens if a sample is compromised/rejected after collection (hemolyzed blood sample, insufficient volume) — does the patient need to return, and is there an extra charge?
76. How are critical/abnormal lab values handled — is there any automatic flagging, or does the lab simply upload a PDF like any other result?
77. Is the ordering doctor (if any) automatically notified when results are ready, or is that entirely the patient's responsibility to share?
78. How long are lab results retained and accessible in the patient's account — indefinitely, or a defined retention period?
79. Can multiple family members' results be viewed under one account, and if so, how is that access controlled (e.g., a parent viewing a child's result vs. an adult's private result)?
80. Is there a defined SLA for result turnaround per test type, and what happens (refund? escalation?) if the lab misses it?
81. Are results shared in a structured, data format (values + reference ranges) in addition to PDF, to enable trend charts over time — or PDF-only for V1?

### 10.7 Notifications
82. What channels are supported (push notification, SMS, email, WhatsApp), and is this configurable per user?
83. Are all notification types treated equally, or are some (e.g., a critical lab result, a doctor cancellation) high-priority and allowed to bypass "do not disturb" settings?
84. What is the fallback if a push notification fails to deliver (app uninstalled, no internet) — does it fall back to SMS?
85. Are appointment reminders sent automatically (e.g., 24h and 2h before), and is the timing configurable per clinic/region?
86. Is there a notification for the *provider* side too (e.g., clinic gets notified of a new booking request, pharmacy of a new prescription) with its own urgency handling?

### 10.8 Reviews & Trust
87. Can a patient only review a doctor/pharmacy/lab after a verified completed transaction, or can anyone leave a review?
88. Is there a moderation queue for reviews (to catch abusive content, fake reviews, competitor sabotage)?
89. Can a provider respond to a review publicly?
90. Can reviews be flagged/reported, and what's the resolution workflow?

### 10.9 Super Admin & Platform Operations
91. What specific internal roles exist within "Super Admin" — e.g., Operations, Finance/Reconciliation, Compliance/Verification, Support/Dispute Resolution, Fraud/Risk? Is one undifferentiated admin role sufficient, or does the operations team need scoped permissions too?
92. What is the provider onboarding/verification workflow — who reviews submitted licenses/registrations, and what's the SLA to go live?
93. How are disputes between patient and provider resolved (e.g., patient says medicine was wrong, pharmacy says it was correct)? Is there a formal ticketing/escalation system?
94. How is fraud detected — fake accounts, review manipulation, a clinic accepting bookings it never intends to honor, a patient repeatedly no-showing?
95. Can Super Admin configure business rules (commission %, cancellation fee tiers, deposit %) without requiring a new software deployment?
96. Does Super Admin have visibility into a patient's health data (prescriptions, results) for support purposes, and if so, is that access logged/audited?
97. What platform-wide reporting does the business need from day one (GMV, bookings by specialty/region, provider performance, no-show rates)?
98. Is there a "kill switch" to suspend a provider immediately upon a serious complaint (e.g., a safety concern), pending investigation?

### 10.10 Legal, Compliance & Data
99. What health-data protection regulation applies in the launch market, and has legal counsel been engaged to confirm platform obligations (encryption, breach notification, data residency)?
100. Is there a formal Terms of Service / patient consent flow for storing and sharing prescriptions and lab results with third parties (pharmacies, labs)?
101. Are minors' (dependents') health records subject to different consent/access rules than adults'?
102. Who legally "owns" the patient relationship if a doctor leaves a clinic — the platform, the clinic, or the doctor?
103. Is there a data retention and deletion policy compliant with local law (e.g., medical records often must be retained X years even if a patient requests deletion)?
104. Are controlled-substance prescriptions subject to any mandatory reporting to a national drug-monitoring authority?
105. What is the incident-response plan if patient health data is exposed in a breach?

### 10.11 QA / Technical Risk Questions (from a QA Architect's perspective)
106. What is the expected behavior under concurrent booking attempts on the exact same slot (load/race condition testing requirement)?
107. What happens if a payment gateway callback is delayed or duplicated — how is double-charging prevented?
108. What is the expected behavior if a pharmacy/lab app is offline when an order/result needs to be pushed to them urgently?
109. Is there a defined behavior for partial data — e.g., an appointment record with a missing payment status due to a crashed session?
110. What's the test strategy for prescription image-quality checking — what's an acceptable false-reject/false-accept rate, and who defines "acceptable"?

*(This is a representative, prioritized set of the highest-impact questions per module. A full workshop-ready list typically runs to 200+ granular items once client-specific answers start generating follow-up questions — we recommend treating this list as the first working draft, to be extended live during the discovery workshop.)*


---

## 11. Business Rules (Proposed — Pending Client Confirmation)

These are **draft rules**, based on healthcare-marketplace best practice, offered as a starting negotiating position for the client workshop — not final decisions.

**Identity & Accounts**
- A patient account may include linked dependent profiles (children, elderly parents); the account holder consents on the dependent's behalf.
- A person may hold multiple role-memberships (e.g., a doctor who is also a patient) under one login, switchable in-app.
- Doctor, Pharmacy, and Laboratory accounts must complete document verification before appearing in patient-facing search.

**Appointments**
- A booking is not "confirmed" until the clinic has explicitly accepted it; payment (if collected upfront) is held, not settled, until acceptance.
- A clinic must respond to a booking request within a defined SLA (e.g., 2 hours during business hours) or the request auto-cancels with full refund.
- A doctor's availability is a single source of truth — no two confirmed bookings may occupy the same doctor-slot.
- No-show is recorded if the patient does not check in within a grace period (e.g., 15 minutes) of the appointment start.

**Payments**
- Deposit percentage (if used) is configurable per clinic within platform-defined minimum/maximum bounds.
- Refund on clinic-rejected bookings is automatic and full, processed within a defined SLA (e.g., 3–5 business days).
- Platform commission is calculated per transaction across all three services (booking, pharmacy order, lab order) and disclosed to providers in their settlement report.

**Pharmacy**
- A prescription image failing automated quality checks may be re-submitted up to a defined limit (e.g., 3 attempts) before requiring manual support review.
- Controlled/scheduled medications require explicit pharmacist confirmation and may not be auto-accepted.
- A pharmacy quote (price, availability) is binding for a defined validity window (e.g., 30 minutes) to prevent bait-and-switch pricing.

**Laboratory**
- Any test legally requiring a doctor's order in the target jurisdiction cannot be self-requested by a patient without an attached valid prescription.
- A critical/abnormal result triggers immediate notification to both patient and ordering doctor (if applicable), bypassing standard notification quiet-hours.
- Results are retained in the patient's account for a minimum legally-compliant retention period.

**Trust & Safety**
- A patient may only submit a review for a doctor/pharmacy/lab following a verified completed transaction.
- Reviews may be flagged and enter a moderation queue; providers may respond publicly but not have reviews removed unilaterally.

**Platform Operations**
- All access to patient prescriptions or lab results by Super Admin/support staff outside of a direct support ticket requires a logged reason code.
- Any provider under active fraud investigation is automatically hidden from new-patient search while remaining visible to existing patients with active bookings.

---

## 12. Edge Cases

### 12.1 Appointment Edge Cases
- Two patients tap "confirm" on the same slot within milliseconds of each other.
- Clinic accepts a booking, then the assigned doctor calls in sick before the appointment.
- Patient pays online, then the clinic rejects the booking — refund fails due to an expired card.
- Patient books, then tries to book the exact same doctor/slot again from a second device before the first request resolves.
- Clinic reschedules a booking to a time the patient can no longer attend, and doesn't respond to further messages.
- Doctor is 45 minutes behind schedule with a full waiting room of confirmed patients.
- Patient shows up but the clinic's system shows no record of the booking (sync failure).
- A booking is made for a dependent (child) but the child is actually the one who shows up alone at a clinic requiring guardian presence.
- Daylight saving time change occurs between booking and appointment date — is the slot still valid at the intended real-world time?
- Doctor's account is suspended (fraud investigation) the day before a patient's already-confirmed appointment.
- A patient with a documented allergy/condition books with a doctor, but the doctor has no way to see this before the visit.
- Same patient books overlapping appointments with two different doctors at two different clinics — should this be blocked, warned, or allowed?
- A clinic manually overrides a doctor's calendar to double-book, causing an online booking collision with a walk-in the clinic already accepted verbally.

### 12.2 Payment Edge Cases
- Patient's payment appears successful in the app, but the gateway later reports it failed (webhook/callback race).
- Refund is issued but the patient's card has since expired or the account is closed.
- Deposit is taken, appointment completes, but the "remaining balance" collection at the clinic is never recorded in-platform, breaking commission calculation.
- Currency rounding differences between displayed price and actual charged amount.
- A promotional/discount code is applied but the pharmacy/lab's actual quote comes in higher than expected due to substitution.
- Duplicate payment webhook delivered twice by the payment provider, risking a double charge if not handled idempotently.
- Patient disputes a charge with their bank (chargeback) after already receiving the service (medicine, lab result, doctor visit).
- Cash payment is marked as "received" by clinic staff but the patient disputes ever paying.

### 12.3 Pharmacy Edge Cases
- Prescription image is technically clear but contains handwriting the pharmacist cannot read.
- Patient uploads a prescription photo of someone else's prescription by mistake.
- Prescription is for a controlled substance, and the pharmacy has no way to verify the patient's identity matches the prescription.
- Pharmacy accepts an order, then discovers mid-preparation that a "confirmed available" medicine is actually out of stock.
- Patient rejects the pharmacy's quote after the pharmacy has already prepared part of the order.
- Best-Offer flow sends the request to 5 pharmacies; 4 never respond — how long does the patient wait before the flow degrades gracefully?
- Delivery courier cannot reach the patient's address; medicine is time-sensitive (e.g., refrigerated) and starts to spoil.
- Two different prescriptions from the same patient, uploaded minutes apart, are actually duplicates (photographed twice) — resulting in a double order.
- Prescription is expired (e.g., 6 months old) but still gets uploaded and a pharmacy accepts it without checking the date.
- Patient's stated notes conflict with the prescription itself (e.g., "please substitute with generic" but prescription explicitly says "no substitution").

### 12.4 Laboratory Edge Cases
- Patient uploads a prescription for a test the lab doesn't offer.
- Patient books a fasting-required test but the confirmation/instructions never reach them in time.
- Sample is collected but lost/damaged in transit to the processing facility.
- Result comes back critically abnormal, but the patient has notifications muted and never opens the app.
- Ordering doctor's account is inactive/suspended by the time results are ready — who receives the critical alert?
- Two test panels ordered together have different turnaround times — does the patient get a partial release of the faster result, or wait for both?
- Patient shows up at the wrong lab branch (booked online for a different branch than they physically visit).
- QR code / booking code is screenshotted and shared with another person who then tries to use it.
- Lab technician enters a result with a typo (e.g., a decimal point error) that would indicate a life-threatening value.

### 12.5 Notification Edge Cases
- Patient's phone number is reassigned (recycled by carrier) and SMS reminders/OTPs go to a stranger.
- Push notification permission was revoked after installation; user believes they'll be reminded but isn't.
- A critical lab-result notification is sent during the patient's configured "quiet hours" — should safety override the preference?
- Notification says "your order is ready" but the underlying status actually reverted due to a later system error (stale notification).

### 12.6 Cross-Cutting / Systemic Edge Cases
- A single person tries to register as a Patient, a Doctor, and later apply as a Clinic Admin — is this legitimate multi-role use, or a fraud pattern to be flagged?
- Platform experiences a partial outage where bookings succeed but notifications fail silently for an hour.
- A provider (doctor/clinic/pharmacy/lab) closes their business entirely with active future bookings/orders still pending.
- A patient's account is compromised (account takeover) and someone else books/cancels appointments or views health data.
- Regulatory audit requires the platform to produce a full access history for one specific patient's data across all six roles within a tight deadline.

*(This is a substantial, representative edge-case set across all modules. Additional edge cases will surface naturally once specific business rules from Section 11 are finalized — each rule tends to generate 3-5 new edge cases when stress-tested, so this list should be treated as a living document through the requirements phase.)*


---

## 13. Risks

### 13.1 Business Risks
- **Two-sided marketplace cold-start problem**: without enough doctors/clinics live at launch, patients see empty search results and churn immediately; without patient demand, providers see no value in participating. Launch sequencing (which city, which specialties, how many anchor clinics before public launch) needs a deliberate plan.
- **Commission resistance**: clinics and pharmacies with thin margins may resist a meaningful take-rate, especially if patients can "meet" through the platform once and then transact offline afterward (disintermediation risk).
- **Provider concentration risk**: if a small number of large clinic chains represent most of the supply, they gain negotiating leverage over commission terms.
- **Three services launched together dilute focus**: building appointments, pharmacy, and lab simultaneously risks a mediocre version of all three rather than an excellent version of one — recommend phased rollout (see Executive Summary).

### 13.2 Technical Risks
- **Double-booking / race conditions** on appointment slots under concurrent load.
- **Payment idempotency** — duplicate charges or missed charges from gateway callback issues.
- **Data model rigidity** — if identity/role relationships (doctor-clinic, patient-dependent) aren't modeled flexibly from the start, later changes are expensive migrations, not simple features.
- **Image-quality-check reliability** — an overly strict automated check frustrates legitimate patients; an overly lenient one lets bad prescriptions through.
- **Scalability of real-time quoting** (pharmacy "Best Offer," lab quote-and-wait) under high concurrent demand.
- **Third-party dependency risk** — SMS/push providers, payment gateways, and courier integrations are all external failure points requiring fallback design.

### 13.3 Operational Risks
- **Front-desk/clinic staff adoption** — if accepting/rejecting bookings is more effortful than the phone-based process it replaces, clinics will neglect the dashboard, and patients experience "black hole" bookings.
- **Pharmacy inventory accuracy** — pharmacies may not keep real-time stock data updated, leading to "confirmed available" medicines that are actually out of stock.
- **Lab result quality control** — a manual PDF-upload process has no built-in check against transcription errors.
- **Support/dispute volume** — with no defined dispute-resolution workflow (Section 10.9), the operations team will be overwhelmed reactively rather than handling issues through a structured process.
- **24/7 vs. business-hours mismatch** — patients may book online outside clinic business hours, creating response-time expectations clinics can't meet without a defined SLA and patient-facing expectation-setting.

### 13.4 Legal / Regulatory Risks
- **Health data protection obligations** — prescriptions and lab results are sensitive personal health data in virtually every jurisdiction; storing and transmitting them to pharmacies/labs without a clear legal basis and consent flow is a compliance gap, not a minor detail.
- **Practicing-medicine boundary** — any feature that could be seen as the platform "recommending" a diagnosis, test, or treatment (even implicitly, e.g., via search ranking or "best offer" algorithms) needs legal review to avoid crossing into unlicensed medical advice.
- **Controlled substance handling** — pharmacy dispensing of scheduled medications is typically subject to strict national tracking/reporting requirements that a generic e-commerce-style pharmacy flow will not satisfy out of the box.
- **Provider licensing verification liability** — if the platform lists a doctor/pharmacy/lab that turns out to be unlicensed or fraudulent, the platform's own liability exposure (and brand damage) needs a defined verification standard, not an honor system.
- **Cross-border data residency** — if the platform expands beyond one country, health-data residency requirements can differ sharply and must be planned for structurally, not patched later.

### 13.5 Healthcare-Specific Risks
- **Critical lab result mishandling** — a delayed or missed notification for a critical/abnormal result is not just a UX bug in this domain; it is a patient-safety incident. This must be designed with the same rigor as the payment system, not treated as "just another notification."
- **Medication error liability** — wrong medicine, wrong dosage substitution accepted without clear patient understanding, or a controlled substance dispensed incorrectly all carry direct patient-safety and legal consequences.
- **Prescription authenticity fraud** — without a verification mechanism, the platform could become a vector for prescription forgery or drug-seeking behavior (particularly relevant for controlled substances).
- **Vulnerable population handling** — dependent profiles (children, elderly) and their data/consent require extra care beyond the standard adult-patient flow.


---

## 14. Future Features (Post-V1 Roadmap Candidates)

These are intentionally **not** included in the recommended V1 scope (Section 6.2), but are worth discussing now so the data model and architecture don't need to be rebuilt later to accommodate them.

| Feature | Why it matters | Architectural implication if deferred without planning |
|---|---|---|
| **Telemedicine (video consultation)** | Expands addressable market beyond geographic proximity | Appointment model should support a "visit type" field (in-person/video) from day one, even if video isn't built yet |
| **Electronic Prescription (doctor issues structured Rx directly, no photo upload)** | Removes image-quality-check problem entirely, enables drug-interaction checking, much stronger pharmacy trust | Prescription data model should be structured (drug/dose/frequency) from day one, not free-text, even if V1 only supports image upload as the input method |
| **Insurance integration** | Major markets increasingly expect in-network filtering and co-pay handling | Doctor/clinic profile should have an extensible "accepted insurance" field from day one |
| **Home doctor visits** | Growing demand segment, especially pediatrics/elderly care | Appointment model's "visit type" should anticipate a "home" option and address-capture flow |
| **Home lab sample collection** | Increasingly a baseline patient expectation, not a premium feature | Lab booking model should anticipate a collection-location field beyond just "branch" |
| **Loyalty / subscription programs** | Retention and repeat-usage driver | Needs its own entitlement/points ledger — should not be bolted onto the payment model directly |
| **Family accounts** | Directly relevant given dependent-profile question in Section 10.1 — recommend resolving this in V1, not deferring | If deferred, patient identity model must still support it structurally from the start |
| **AI-assisted specialty/doctor recommendation** | Differentiator, but carries the "practicing medicine" legal risk flagged in Section 13.4 | Requires its own legal review track; should not be rushed in to hit a launch date |
| **Multi-branch/franchise clinic chain management tools** | Needed once large clinic groups become platform partners | Clinic data model should support a "parent organization → branches" hierarchy from day one even if V1 only has single-branch clinics |
| **Provider-side analytics/BI dashboards** | Increases provider stickiness and justifies commission | Requires an analytics data pipeline separate from transactional systems — worth flagging early even if the dashboards themselves come later |

---

## 15. Meeting Checklist

**Print this page and bring it to tomorrow's client meeting.**

### Before diving into features, confirm the big-picture direction:
- [ ] Confirm launch scope: all three services at once, or phased (recommend: booking first)?
- [ ] Confirm target launch city/region and whether multi-region is a near-term goal
- [ ] Confirm whether this is investor-facing (pitch/fundraising) or an internally-funded build — changes how much rigor is needed in this discovery phase before committing to estimates

### Walk through Section 10 questions, module by module — do not skip any module:
- [ ] 10.1 Identity, Accounts & Relationships — especially: can doctors work at multiple clinics, can patients book for dependents
- [ ] 10.2 Doctor Directory & Search — especially: how are ratings verified, is sponsored placement part of the model
- [ ] 10.3 Appointments — especially: acceptance SLA, no-show definition, reschedule mechanics
- [ ] 10.4 Payments (Appointments) — **flag as highest priority**: deposit rules, refund rules, commission mechanics, payout schedule
- [ ] 10.5 Pharmacy — especially: is any external prescription accepted, controlled-substance handling, delivery mechanics
- [ ] 10.6 Laboratory — especially: is a doctor's order required, critical-result escalation, home collection (now or later)
- [ ] 10.7 Notifications — especially: channels, urgency tiers
- [ ] 10.8 Reviews & Trust — especially: verified-visit-only reviews
- [ ] 10.9 Super Admin & Platform Operations — especially: internal role breakdown, dispute resolution process
- [ ] 10.10 Legal, Compliance & Data — **do not proceed to development without at least a preliminary answer here**; recommend involving legal counsel before final scoping
- [ ] 10.11 QA/Technical Risk — flag for the engineering team, not necessarily the client, but confirm client is aware these require engineering time

### Decisions to leave the meeting with (minimum viable outcome):
- [ ] A confirmed phased scope (what's in V1 vs. Section 14 future features)
- [ ] A named decision-maker on the client side for payment/commission policy
- [ ] Agreement on whether legal/compliance counsel needs to be engaged before scoping is finalized
- [ ] A shortlist of 2-3 anchor clinics/pharmacies/labs (if known) to use as real reference cases while defining business rules — abstract discussion is far less productive than "okay, how would Clinic X actually handle this"
- [ ] Agreement on next step: a follow-up workshop to finalize Business Rules (Section 11) and produce a locked V1 scope document

### Do NOT let the meeting end with:
- [ ] Payment/refund/cancellation rules still undefined but a launch date already promised
- [ ] "We'll figure out Super Admin later" — this typically becomes 15-20% of total effort and needs to be scoped now
- [ ] Legal/compliance treated as a "later" item for a platform that handles prescriptions and lab results from day one

---

*End of Discovery Document. This document is intended as a living artifact — as questions in Section 10 are answered, they should convert directly into finalized entries in Section 11 (Business Rules), which in turn becomes the direct input to a Software Requirements Specification and system architecture, the next phase of this engagement.*
