# Project Services & Cost Audit

- **Project:** MedSuper backend (`clinic-reservations`, branch `ready`, commit `f3f151f`)
- **Audit date:** 2026-09-30
- **Revision:** v2. Adds the Twilio scope correction and a validation pass (Section 26).
- **Scope:** Read-only audit. No application code, dependency, or configuration was changed.
- **Currency:** USD unless stated. Egyptian providers publish prices in EGP, and those stay in EGP.

**Labels used throughout**

| Label | Meaning |
|---|---|
| **Confirmed** | Proven by committed code/config, a live public endpoint, or an official provider page |
| **Likely** | Strong inference, but deployment or account confirmation is missing |
| **Estimated** | Calculated from confirmed prices and stated assumptions |
| **Assumption** | Chosen input, not verified |
| **Unknown** | Needs `.env`, Cloud Console/`gcloud`, or provider account access |
| **Unverified** | A price found only in secondary or search sources, not re-confirmed on an official page |

> **Secrets.** The real `.env` was **not read**. Access was blocked, and it holds credentials. No secret values appear in this report. `gcloud` is not installed on the audit machine, and the repo has no CI/CD or Cloud Run config. The only deployment evidence is public HTTP responses from the live URL (unauthenticated `GET`/`OPTIONS` to health endpoints).

> **Intended MVP scope (per product owner, 2026-09-30).**
> - **Twilio = patient OTP / phone verification + password reset only.**
> - **Firebase (FCM) = all notifications.**
>
> Wherever the existing code differs from this, it is marked **"Existing implementation differs from intended MVP scope."**

---

## 1. Executive Summary

| # | Service | Status | Cost type |
|---|---|---|---|
| 1 | Google Cloud Run (API) | **Confirmed** live in europe-west1. Configuration **Unknown** | Pay-as-you-go + free tier |
| 2 | PostgreSQL (Prisma), documented as **Neon** | Engine **Confirmed**; live DB reachable. Neon is **Likely** (docs), host **Unknown** | Free tier → pay-as-you-go |
| 3 | Redis (`ioredis`), stated to be Upstash | Use **Confirmed** (live readiness check reports `redis: ok`). Upstash is **Unknown** from the repo | Free tier → pay-as-you-go |
| 4 | ImageKit | **Confirmed** (required at boot) | Free (hard cap) → subscription |
| 5 | Firebase Cloud Messaging | Integrated. Credentials optional; set or not is **Unknown** | **Free** |
| 6 | Twilio (OTP + password reset) | **Not integrated.** Planned | Prepaid, per SMS |
| 7 | Paymob / FawryPay | Integrated, **not provisioned** | Per transaction (+ Fawry fees needing confirmation) |
| 8 | Cloud Logging | Implicit (stdout) | Free ≤ 50 GiB/project/month |

**Findings that most change the budget:**

1. **Twilio SMS is still the largest variable cost, even limited to OTP + reset.** At **$0.3959 per SMS segment** (Confirmed, official Egypt page), MVP OTP + reset traffic (Assumption: 550–2,200 SMS/month) costs **about $218–$871/month**.
2. **The code sends notification SMS today.** `AppointmentConfirmed`, `AppointmentCancelled`, and `CriticalLabResult` list `SMS` as a channel. The SMS goes to `LoggingSmsSender`, which only writes a log line. **Existing implementation differs from intended MVP scope.** These must stay off Twilio or be switched to push-only. If Twilio is ever bound to `SMS_SENDER` as well as `OTP_SENDER`, every booking and cancellation adds about $0.40.
3. **Current SMS abuse protections are per phone number only.** An attacker using many Egyptian numbers is limited only by a 100 requests/min in-memory throttle per IP per Cloud Run instance. That throttle is not shared across instances. Section 26.7 explains the exposure.
4. **The worker drives the fixed database cost.** It polls the DB every 2 s. Neon only suspends compute after 5 minutes with no active queries, so a running worker keeps compute on 24/7. That is 182.5 CU-hours/month minimum, more than the Free plan's 100 CU-hours. **Whether the worker is deployed anywhere is Unknown.** Without it, holds never expire and no notifications are delivered, including the in-app inbox.
5. **The deployed revision can't be built from the current repo.** At HEAD, the committed `Dockerfile` image can't start under any `NODE_ENV`:
   - **Production:** blocked by the OTP-sender check.
   - **Anything else:** the logger requires `pino-pretty`, a devDependency that the image prunes, so startup throws.

   The live service responds normally, so it's running an **older or differently built revision**. This corrects v1 of this report, which said the live service "can't be production". Its actual `NODE_ENV` is **Unknown**.
6. **OTP codes are written to logs in every environment**, production included. `LoggingOtpSender` logs at `warn` level, which is above both `info` and `debug`, so log level doesn't hide them. This lasts until a real sender is bound.

**Budget headline**

| | Development | Staging | MVP Production |
|---|---:|---:|---:|
| Infrastructure (Cloud Run, DB, Redis, ImageKit, GCP misc) | $0 | $0 – ~$110 | ~$40 – ~$156 |
| Firebase FCM (push) | $0 | $0 | **$0** |
| Twilio (OTP + password reset only) | $0 | $0 – ~$40 | **~$218 – ~$871** |
| **Total (excluding payment fees)** | **$0** | **$0 – ~$150** | **~$258 – ~$1,027** |
| Payment processing | — | sandbox | % of volume (Section 11) |
| **Upfront cash** | $0 | $0 (Twilio trial) | **$20 Twilio minimum (Likely)**, plus cards on file. Fawry fees need vendor confirmation |

### 1A. Answers to the final questions

1. **What external services does the system actually use?** Cloud Run, PostgreSQL (Neon per docs), Redis, ImageKit, and Cloud Logging. FCM, Paymob, and FawryPay are integrated but need credentials. Twilio is planned only.
2. **Which ones are paid?** Twilio (per SMS) and the payment providers (per transaction). Cloud Run, Neon, Upstash, and ImageKit become paid beyond their free tiers.
3. **Which ones are free at MVP usage?** FCM (always), probably Upstash, Cloud Logging, the Cloud Run API service (if it scales to zero), and ImageKit (initially).
4. **Which ones are pay-as-you-go?** Cloud Run, Neon Launch, Upstash PAYG, the other GCP services, Twilio (drawing on a prepaid balance), and the payment providers.
5. **Which ones need a subscription?** ImageKit Lite/Pro once past the free tier. Possibly Fawry's published monthly minimum (needs vendor confirmation).
6. **Which ones need a prepaid balance?** Twilio.
7. **Which ones charge a card automatically?** GCP, Neon, Upstash, and ImageKit. Twilio auto-recharges if enabled. Payment providers deduct fees from settlements instead.
8. **How much money is needed upfront?** About **$20** (Twilio minimum, Likely), plus a recommended one-month SMS buffer. Fawry's setup fee is published but its applicability is unconfirmed.
9. **Development monthly cost?** **$0.**
10. **Staging monthly cost?** **$0 – ~$150.**
11. **MVP Production monthly cost?** **~$258 – ~$1,027** excluding payment fees.
12. **Largest variable costs?** Twilio SMS, payment processing fees, and ImageKit storage/bandwidth growth.
13. **What could raise the bill unexpectedly?** OTP/reset SMS pumping across many numbers, 2-segment SMS, Twilio accidentally wired to notification SMS, the worker keeping Neon awake, and Cloud Run minimum instances.
14. **What's still missing?** See Section 26.13 (the must-verify list).

---

## 2. Project Context

| Item | Value | Label |
|---|---|---|
| Codebase | NestJS modular monolith. **API** (`src/main.ts`) and **worker** (`src/worker.ts`) built from one image | Confirmed |
| DB | PostgreSQL (`migration_lock.toml` provider `postgresql`), with `pg_trgm` + `postgis` extensions | Confirmed |
| Market | Egypt only. OTP and reset phone numbers must match `^\+201[0125]\d{8}$` | Confirmed |
| CI/CD | **None in the repo.** No `.github/`, `cloudbuild.yaml`, `service.yaml`, or IaC | Confirmed |
| `Dockerfile` | Added in commit `ba9b5b1` (2026-09-25). Earlier deployments used an unknown build method | Confirmed (git history) |

---

## 3. Complete Service Inventory

| Service | Evidence | Classification |
|---|---|---|
| Google Cloud Run | Live URL; `server: Google Frontend` and `x-cloud-trace-context` response headers | **Confirmed Active** |
| PostgreSQL (Neon) | `DATABASE_URL`/`DIRECT_URL` required; Neon named in `.env.example`, `MEMORY.md`, File 12; live `/v1/health/ready` → `database: ok` | **Confirmed Active**. Neon is Likely |
| Redis | `src/shared/kernel/redis/redis.service.ts` (`ioredis`), global `RedisModule`; live readiness check → `redis: ok` | **Confirmed Active**. Upstash is Unknown from the repo |
| ImageKit | `src/shared/kernel/storage/imagekit-storage.adapter.ts` | **Confirmed Active** |
| Firebase Cloud Messaging | `src/modules/notifications/infrastructure/fcm-push-notification.adapter.ts` (`firebase-admin/app` + `/messaging` only) | **Configured**. Credentials Unknown |
| Twilio / any SMS provider | None. `LoggingOtpSender` + `LoggingSmsSender` placeholders | **Planned** |
| Paymob | `src/modules/payments/infrastructure/paymob-payment-gateway.adapter.ts` | **Configured, not provisioned** |
| FawryPay (direct) | `src/modules/payments/infrastructure/fawry-payment-gateway.adapter.ts` | **Configured, not provisioned** |
| `PAYMOB_INTEGRATION_ID_FAWRY` | In `.env.example` only; not read by any code | **Legacy / Unused** |
| Cloud Logging | pino JSON to stdout | **Confirmed (implicit)** |
| Artifact Registry, Cloud Build, Secret Manager, Monitoring | Not in the repo | **Unknown** |
| Sentry, Datadog, Grafana, etc. | Absent; recommended in File 10 only | **Not present** |
| Email, OCR, maps API, queues (BullMQ/Pub-Sub) | Absent or no-op placeholders | **Not used** |
| Local Postgres/PostGIS + Redis | `docker-compose.yml` | Dev only, $0 |

---

## 4. Service Dependency Map

```
 Clients ──HTTPS──► Cloud Run API (europe-west1) ──► Neon Postgres (required)
                          │                      ──► Redis (required at boot)
                          │                      ──► ImageKit (required env; upload + signed URLs)
                          │                      ──► Paymob / FawryPay (optional; webhooks → API)
                          │                      ──► OTP_SENDER → LoggingOtpSender (logs only) ⇢ Twilio (planned)
                          ▼
                    Cloud Logging (stdout)

 Worker (dist/worker.js) — deployment UNKNOWN
   ├─ OutboxWorker (every 2 s) ─► NotificationOutboxRegistrar ─► in-app rows + FCM push
   │                                                        └─► SMS_SENDER → LoggingSmsSender (3 templates)
   ├─ HoldExpiryJob (every 1 min) ─► FawryPay cancel-unpaid-order (for FAWRY holds)
   ├─ SlotGenerationJob (daily 01:00)
   └─ NotificationRetryJob (every 5 min)
```

---

## 5. Google Cloud Run

| Item | Repository evidence | Live/external evidence | Label |
|---|---|---|---|
| Region | — | Hostname `…europe-west1.run.app` | **Confirmed** |
| Service name | — | `medsuper-api` (hostname prefix); project number `69168697113` | **Likely** (the hostname prefix normally equals the service name) |
| CPU / memory / min / max / concurrency / timeout / billing mode | Nothing in the repo | Not visible | **Unknown** |
| Container port | `EXPOSE 3000`; `PORT` default 3000 | Cloud Run injects `PORT` (normally 8080), which the app honours | Confirmed (code) / Unknown (actual) |
| Env var names | Required: `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `REDIS_ENABLED`, `JWT_ACCESS_SECRET`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`. Optional: `NODE_ENV`, `PORT`, `CORS_ALLOWED_ORIGINS`, `IMAGEKIT_PUBLIC_KEY`, `PAYMOB_*` (5), `FAWRY_*` (3), `FIREBASE_*` (3) | `CORS_ALLOWED_ORIGINS` is **unset** on the live service (it reflected a random probe origin) | Confirmed |
| Production mode / log level | See Section 26.12 | — | **Unknown** |
| Throttling | `ThrottlerGuard` 100 req/60 s, **in-memory** per instance | Live headers show `x-ratelimit-limit: 100` | Confirmed |

**Pricing** (Tier 1, europe-west1). Checked 2026-09-30 via search excerpts citing https://cloud.google.com/run/pricing; the page itself didn't render in the fetch tool.

| | Request-based | Instance-based |
|---|---|---|
| CPU | $0.000024/vCPU-s | $0.000018/vCPU-s |
| Memory | $0.0000025/GiB-s | $0.000002/GiB-s |
| Requests | $0.40/million | — |
| Free/month (per billing account) | 2 M requests, 180K vCPU-s, 360K GiB-s | 240K vCPU-s, 450K GiB-s |

Worker-pool pricing is **Unverified**; this report assumes instance-based rates.

**Estimate** (Assumption: 1 vCPU / 512 MiB)

| | Dev | Staging | MVP Prod |
|---|---:|---:|---:|
| API, min 0 | $0 | $0 | $0 – $10 |
| API, min 1 (if set) | — | ~$30 – $45 | ~$30 – $45 |
| Worker, always-on 0.5–1 vCPU | $0 | $0 / ~$20 – $45 | ~$20 – $45 |
| Artifact Registry, Secret Manager, Logging | — | $0 – $2 | $0 – $2 |
| **Total** | **$0** | **$0 – ~$90** | **~$20 – ~$90** |

---

## 6. Database

| Item | Finding | Label |
|---|---|---|
| Engine | PostgreSQL + PostGIS + pg_trgm | **Confirmed** |
| Provider | Neon, named in `.env.example` ("Neon Postgres — pooled (PgBouncer…)"), `MEMORY.md`, `CLAUDE.md`, File 12 Part 2 | **Likely**. The host is in `.env` (not read) |
| Live DB | `/v1/health/ready` → `database: ok` | Confirmed reachable; provider not visible |
| Dev DB | `docker-compose.yml` local PostGIS exists. Which DB developers actually use is Unknown | Unknown |
| Staging DB, dev/staging sharing, Neon plan, region | Not discoverable without secrets or a console | **Unknown** |

**Neon pricing** (https://neon.com/pricing, checked 2026-09-30)

| Plan | Price |
|---|---|
| Free | 100 CU-h/project, 0.5 GB, scale-to-zero after 5 min |
| Launch | $0.106/CU-h, $0.35/GB-month, no minimum |
| Scale | $0.222/CU-h |

**Suspension rule** (https://neon.com/docs/introduction/scale-to-zero): compute suspends after **5 minutes with no active queries**. Each connection request resets the timer.

**Estimate**

| | Dev | Staging | MVP Prod |
|---|---:|---:|---:|
| Worker **not** running | $0 | $0 (Free) | Launch, usage-based: ~$2 – $10 |
| Worker running 24/7 (≥ 0.25 CU × 730 h = 182.5 CU-h) | $0 (local) | Free exhausted in ~16 days → suspended; Launch **~$20** | **~$20 – $45** |

---

## 7. Upstash Redis

See Section 26.2 for the evidence. **Usage:** rate limiting (OTP/reset and password login, per phone), idempotency keys for 12 write routes, and a readiness `PING`. **Not used** as a cache, queue, job store, or session store.

**Pricing** (https://upstash.com/pricing/redis, checked 2026-09-30)

| Plan | Price |
|---|---|
| Free | 500K commands/month, 256 MB |
| PAYG | $0.20 per 100K commands |

**Estimate:** $0 (dev: local Docker) / $0 (staging) / **$0 – ~$1** (prod, about 100K commands/month, Assumption).

---

## 8. Firebase Push Notifications

**Product used:** Firebase Admin SDK → **Cloud Messaging only**, via `sendEachForMulticast`. No Auth, Phone Auth, Firestore, or Storage.

**Pricing:** FCM is **no-cost on both the Spark and Blaze plans**, and Spark needs no payment method (https://firebase.google.com/pricing, 2026-09-30). **Cost is $0 in every environment.**

**Notification events implemented** (`src/modules/notifications/domain/notification-templates.ts`, 34 templates). Every template uses `PUSH`, and each also creates an in-app notification row readable through `GET /v1/notifications`.

| Area | Events | Recipient | Channels in code |
|---|---|---|---|
| Appointments (patient) | `AppointmentConfirmed`, `AppointmentCancelled` | Patient | **PUSH + SMS**. ⚠ Existing implementation differs from intended MVP scope |
| Appointments (doctor/assistant) | `NewAppointmentBookedForDoctor`/`…ForAssistant`, `AppointmentCancelledFor…` (×2), `AppointmentRescheduledFor…` (×2) | Doctor/assistant | PUSH |
| Lab | `LabResultReady`, `LabResultReadyForProvider`, `ProviderLabOrderCreated`, `LabOrderStatusChanged`, `NewLabOrderForStaff` | Patient/provider/lab staff | PUSH |
| Lab (safety-critical) | `CriticalLabResult` | Patient | **PUSH + SMS**. ⚠ Existing implementation differs from intended MVP scope |
| Prescriptions | `PrescriptionUploaded`/`Accepted`/`Rejected`; `ProviderPrescription*` (×5) | Patient/provider | PUSH |
| Pharmacy | `PharmacyOrderAccepted`/`Quoted`/`Rejected`, `ProviderPharmacyOrderCreated`/`StatusChanged`, `NewPharmacyOrderForStaff` | Patient/provider/pharmacy staff | PUSH |
| Payments/wallet | `PaymentCaptured`, `PaymentFailed`, `RefundIssued`, `PaymentAutoRefunded`, `WalletToppedUp` | Patient | PUSH |
| Admin | `NewProviderRegistrationForAdmin` | Admin | PUSH |

**Delivery behaviour:**
- Tiers are `INFORMATIONAL`, `TRANSACTIONAL`, and `SAFETY_CRITICAL`. `SAFETY_CRITICAL` can't be disabled and bypasses quiet hours.
- A push to a user with no device token is marked FAILED and retried every 5 min, up to 5 times. This costs DB work, not money.
- **All of this runs only in the worker** (Section 12).

---

## 9. Twilio OTP (OTP + password reset ONLY)

### 9.1 Current implementation (code-verified)

| Question | Answer | Source |
|---|---|---|
| OTP implemented internally? | **Yes, fully.** Only delivery is missing | `identity-auth/application/request-otp.use-case.ts` |
| Generated | `generateOtpCode()` → 6 digits via `crypto.randomInt` | `identity-auth/domain/otp-code.util.ts` |
| Stored | `otp_requests` row: phone, **argon2 hash**, purpose (`LOGIN_OR_SIGNUP` / `PASSWORD_RESET`), `expires_at`, `attempts`, `verified_at`, `consumed_at` | `otp-request.repository.ts` |
| Verified | Login: `verify-otp.use-case.ts`. Reset: `verify-reset-code.use-case.ts` (marks verified, doesn't consume), then `reset-password.use-case.ts` (consumes, sets the password, revokes all refresh tokens) | same folder |
| Expiry | **300 s** | `domain/otp.constants.ts` |
| Wrong-code attempts | **5**, then `423 TOO_MANY_ATTEMPTS`. Attempts send no SMS | `otp.constants.ts`, `verify-otp.use-case.ts` |
| Request rate limit | **3 requests per 10 min per phone**, Redis key `otp-rate:<phone>`. **Shared by login OTP and password reset.** 429 responses send no SMS | `infrastructure/phone-rate-limiter.service.ts` |
| Resend | No dedicated endpoint. A resend is a **new request and a new SMS** | controller |
| Login flow | `POST /v1/auth/otp/request` → SMS → `POST /v1/auth/otp/verify` → user auto-created with the `PATIENT` role → tokens | `identity-auth.controller.ts` |
| Password reset flow | `POST /v1/auth/password/forgot` → **the same `RequestOtpUseCase`**, so the code **is sent through `OTP_SENDER` (today: logged, not sent)** → `/password/reset/verify-code` → `/password/reset`. **An SMS is sent even if no account exists for that phone** (no existence check before sending) | `forgot-password.use-case.ts` |
| Who uses it | Patients (OTP login/signup). Any user with a phone (staff included) for password reset. Staff normally log in with a password (`/password/login`) | controller |
| **Integration point** | **Exactly one:** bind `OTP_SENDER` to a Twilio adapter in `identity-auth.module.ts:109`, replacing `LoggingOtpSender`, and remove the production-blocker line in `env.validation.ts`. Both login and reset go through it. **Do not bind `SMS_SENDER`** (`notifications.module.ts`) to Twilio | — |

### 9.2 Option comparison

| | **Option 1: Programmable Messaging** | **Option 2: Verify** |
|---|---|---|
| Model | Backend generates and verifies; Twilio only delivers | Twilio generates, sends, and checks the code |
| Egypt price | **$0.3959 per SMS segment** (Confirmed, https://www.twilio.com/en-us/sms/pricing/eg) | **$0.05 per successful verification** + channel fee per SMS attempt (https://www.twilio.com/en-us/verify/pricing). The Egypt channel fee under Verify is **Unverified**; this report assumes $0.3959 |
| Extra fees | $0.001 per message ending in "Failed" status. Undelivered-but-sent messages are billed ("charged per segment") | No $0.05 fee for failed/expired verifications, but "message attempts are always charged and not subject to delivery" |
| Fraud controls | None built in | Includes Verify Fraud Guard (SMS-pumping protection) |
| Architecture change | **None.** One adapter + one DI binding | **Yes.** `otp_requests` hashing/expiry/attempts would be replaced by Verify calls in 4 use-cases, and the reset flow's `requestId` model changes. Verify's custom-code option can't be used on a trial account |
| Deposit / billing / trial / limits | Same Twilio account terms (Section 9.4) | same |

### 9.3 Monthly scenarios (OTP + password reset ONLY)

**Assumptions:**
- 1 accepted OTP request = 1 SMS.
- 1 accepted password-reset request = 1 SMS.
- One segment per message (the text isn't written yet; it must stay ≤ 70 Arabic or ≤ 160 GSM-7 characters).
- Rate-limited (429) requests send nothing.
- Wrong-code attempts send nothing.
- Resends are extra requests. The last column adds a 20% resend allowance (Assumption).
- Verify: 85% of requests complete (Assumption).

| Monthly OTP requests | Monthly reset requests | SMS count | **Programmable Messaging** | + 20% resends (SMS / cost) | Verify (est.) |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 100 | 1,100 | **$435.49** | 1,320 / $522.59 | $482.24 |
| 5,000 | 500 | 5,500 | **$2,177.45** | 6,600 / $2,612.94 | $2,411.20 |
| 10,000 | 1,000 | 11,000 | **$4,354.90** | 13,200 / $5,225.88 | $4,822.40 |
| 50,000 | 5,000 | 55,000 | **$21,774.50** | 66,000 / $26,129.40 | $24,112.00 |
| 100,000 | 10,000 | 110,000 | **$43,549.00** | 132,000 / $52,258.80 | $48,224.00 (custom pricing likely at 100K+) |

- A 2-segment message doubles the SMS count and cost.
- The upper bound per phone number is 3 SMS per 10 minutes = **432 SMS/day ≈ $171/day per number** (see Section 21).

### 9.4 Account terms

| Term | Detail | Label |
|---|---|---|
| Upgrade deposit | Adding a payment method and **a minimum $20** deposit | **Likely**. Two Twilio help-centre articles say so in search excerpts; the articles themselves didn't render for direct verification |
| Prepaid / auto-recharge | Prepaid balance. Auto-recharge (default trigger < $10, max refill $2,000). Emails at $5 and $0. **Project suspended at $0** | Likely (same sources) |
| Trial | Verified recipients only (max 5), **Twilio-provided templates only (no custom bodies)**, 100 SMS + 40 verifications, sign-up country only | Confirmed, https://www.twilio.com/docs/usage/trials |
| Spending limit | No hard cap is documented in the sources checked. The practical cap is the prepaid balance with auto-recharge off | Unverified |
| Egypt sender | Alphanumeric sender supported. Domestic registration takes ~3 weeks. Domestic long codes are not supported. "Medicine/drug related" content is prohibited (OTP text is fine) | Confirmed, https://www.twilio.com/en-us/guidelines/eg/sms |

---

## 10. ImageKit

**Uploads:**
- Prescriptions and lab referrals: patient/provider, **private**.
- Lab results: lab staff, **private**.
- Verification documents: providers, **private**.
- Doctor photos: **public**.

**Features used:** upload, private files, and signed URLs (5-minute TTL, generated locally). No transformations. Files are never deleted.

**Pricing** (https://imagekit.io/plans/, 2026-09-30)

| Plan | Price | Included |
|---|---|---|
| Free | $0 | 20 GB bandwidth / 3 GB storage, **hard stop** |
| Lite | $9/month | 40 GB bandwidth / 10 GB storage; overage $0.50/GB bandwidth, $0.10/GB storage |

**Estimate:** $0 (dev) / $0 (staging) / **$0 → $9–$20** (prod, as stored files accumulate).

---

## 11. Payment Providers

Section 26.10 has the code evidence for the scope conflicts.

| Provider | Methods in code | Published fees | Label |
|---|---|---|---|
| Paymob | `CARD`, `MOBILE_WALLET`, wallet top-up (card), late-payment refunds | **2.75% + 3 EGP**, no setup or monthly fees, weekly settlement (https://paymob.com/en/pricing) | Published. Per-method (wallet) rates need contract confirmation |
| FawryPay direct | `FAWRY` reference code, cancel-unpaid, late-payment refunds | See the next paragraph | **Needs Fawry confirmation** |

**FawryPay fees.** An earlier fetch of https://atfawry.com/pricing (2026-09-30) returned: reference code 2.75%, 999 EGP setup, 499 EGP "Monthly Minimum Processing", 3 EGP per refund, and 0.16 EGP per SMS. A re-fetch on the same date returned **no pricing content**. The page appears to cover the **Fawry Accept** product (plans and e-store), and doesn't clearly state whether these fees apply to a direct FawryPay API merchant. **Published price found, applicability to MedSuper integration requires Fawry confirmation.** The 14% VAT on fees comes from a secondary source: **Unverified.**

**Who pays:** gateway fees aren't modelled anywhere in the code (no fee columns). They come out of MedSuper's settlement. Patients pay the listed price; providers pay commission only.

**Scope:** transaction costs are kept separate from infrastructure in every table in this report.

---

## 12. Background Jobs

| Job | Frequency | DB activity | External calls |
|---|---|---|---|
| `OutboxWorker.drain` (`shared/core/outbox/outbox.worker.ts`) | every **2 s** (`@Interval`) | 1 transaction + `SELECT … FOR UPDATE SKIP LOCKED` per tick, even when idle (~1.3 M/month) | FCM (through notifications) |
| `HoldExpiryJob` (`scheduling-appointments/infrastructure/hold-expiry.job.ts`) | every **1 min** | query + per-hold transaction | FawryPay `cancel-unpaid-order` for FAWRY holds |
| `SlotGenerationJob` | daily 01:00 | inserts slots 30 days ahead | — |
| `NotificationRetryJob` | every **5 min** | reads FAILED notifications | FCM (+ SMS sender) |

There's no Redis-based queue. The worker holds an idle Prisma pool and an idle ioredis connection, which issue no Redis commands. Details in Section 26.3–26.4.

---

## 13. Monitoring & Logging

- Only pino → stdout → Cloud Logging. No Sentry, Datadog, Grafana, or uptime checks in the repo.
- Cloud Logging: 50 GiB/project/month free, then $0.50/GiB. **Estimated $0** at MVP scale.
- **Security issue: OTP codes are logged at `warn` level** (Section 26.12).

## 14. Other External Services

None beyond Section 3.

---

## 15. Development Cost

**$0**: local Docker Postgres + Redis, ImageKit Free, OTP logged, payment sandboxes, FCM free.

## 16. Staging Cost

| Service | Low | High |
|---|---:|---:|
| Cloud Run API | $0 | ~$45 (min 1) |
| Worker | $0 (not deployed) | ~$20 – $45 |
| Neon | $0 | ~$20 |
| Upstash | $0 | $0 |
| Firebase FCM | $0 | $0 |
| Twilio (OTP/reset) | $0 (logged, or trial with 100 free SMS) | ~$40 (~100 real SMS on a paid account) |
| ImageKit | $0 | $0 |
| Other GCP | $0 | ~$2 |
| **Total** | **~$0** | **~$150** |

The Twilio trial only allows Twilio-provided templates, so testing MedSuper's own OTP text needs an upgraded account.

## 17. MVP Production Cost

**Assumptions:** 500–2,000 OTP requests + 50–200 password resets per month (550–2,200 SMS); worker always on.

| Service | Low | High | Label |
|---|---:|---:|---|
| Cloud Run + GCP misc | ~$20 | ~$90 | Estimated |
| Neon Launch | ~$20 | ~$45 | Estimated |
| Upstash | $0 | ~$1 | Estimated |
| ImageKit | $0 | ~$20 | Estimated |
| **Infrastructure subtotal** | **~$40** | **~$156** | |
| **Firebase FCM (push)** | **$0** | **$0** | Confirmed |
| **Twilio (OTP + reset only)** | **~$218** | **~$871** | Estimated |
| **Total excluding payment fees** | **~$258** | **~$1,027** | |
| Payment processing | 2.75% + 3 EGP (Paymob); Fawry per contract | | Published / needs vendor |

## 18. Fixed vs Variable Costs

| Type | Items |
|---|---|
| **Fixed** | Always-on worker (~$20–$45); Neon compute kept awake by the worker (~$20+); Cloud Run min instances if set; ImageKit Lite ($9) once subscribed; Fawry monthly minimum **if confirmed** |
| **Variable** | **Twilio OTP/reset SMS**; Cloud Run above the free tier; Neon storage; ImageKit overage; Upstash commands |
| **Transaction** | Paymob 2.75% + 3 EGP; Fawry (contract) |
| **One-time** | Twilio alphanumeric sender registration (no published fee; ~3 weeks); Fawry setup **if confirmed** |
| **Potential** | Neon, ImageKit, and Upstash free-tier hard stops (outages, not charges); SMS pumping; 2-segment SMS; Twilio bound to notification SMS |

## 19. Initial Funding Required

| Provider | Upfront | Label |
|---|---:|---|
| Twilio | **$20 minimum deposit**; recommend ~1 month of expected SMS spend ($218–$871) or auto-recharge | Likely |
| Google Cloud / Neon / Upstash / ImageKit | $0 deposit; card on file (ImageKit Lite $9 when needed) | Confirmed |
| Firebase | $0, no card | Confirmed |
| Paymob | $0 published | Needs contract |
| FawryPay | Published 999 EGP setup | **Needs Fawry confirmation, not a confirmed project cost** |

## 20. Billing & Payment Process

| Service | Process |
|---|---|
| GCP | Billing account + card → metered → monthly auto-charge. Budgets alert but don't cap |
| Neon / Upstash | Card → metered → monthly auto-charge |
| ImageKit | Card → monthly/yearly subscription + overage |
| Firebase FCM | No billing |
| Twilio | Trial → upgrade with card + ≥ $20 prepaid → usage draws the balance → auto-recharge → suspended at $0 |
| Paymob / Fawry | KYC/contract → fees deducted from weekly settlements |

## 21. Unexpected Cost Risks

| Risk | Control |
|---|---|
| SMS pumping across many Egyptian numbers, on both `/otp/request` and `/password/forgot` (Section 26.7) | Per-IP/global OTP caps in Redis; Twilio balance with auto-recharge off or low; Verify Fraud Guard if Option 2 |
| Password-reset SMS to phones with no account | Check the account exists before sending (a code change, out of scope here) |
| Twilio bound to `SMS_SENDER` by mistake → notification SMS | Keep `SMS_SENDER` off Twilio; make the 3 templates push-only |
| 2-segment SMS | Keep the OTP text within 1 segment |
| Worker keeps Neon awake | Budget for it, lengthen the poll interval, or make it event-driven |
| Free-tier hard stops (Neon/ImageKit/Upstash) | Paid tiers in production |
| Cloud Run min instances / staging running 24/7 | Scale staging to zero |

## 22. Cost Optimization Options

| Area | Options | Trade-off |
|---|---|---|
| OTP SMS ($0.3959) | Verify (+$0.05, fraud guard); local Egyptian SMS aggregators; WhatsApp OTP. Prices for these were not researched | Vendor, contract, and architecture impact vary |
| Worker polling | `LISTEN/NOTIFY`, drain on emit, or Cloud Scheduler-triggered sweeps | Code change; notification latency |
| DB | Neon vs Cloud SQL (same region) | Cloud SQL has no scale-to-zero |
| Storage | ImageKit vs GCS | More code; same-cloud PHI |

## 23. Assumptions

1. Cloud Run 1 vCPU / 512 MiB; API min 0; worker (if deployed) always on at 0.5–1 vCPU.
2. Neon with the worker polling 24/7 at ≥ 0.25 CU.
3. MVP: 500–2,000 OTP + 50–200 resets/month; 1 SMS per accepted request; 1 segment.
4. Verify channel fee = $0.3959; 85% verification completion.
5. About 100K Redis commands/month; about 4 GB/month of new ImageKit storage.

## 24. Unknowns Requiring Confirmation

See Section 26.13.

## 25. Official Pricing Sources (all checked 2026-09-30)

| Service | URL | Status |
|---|---|---|
| Cloud Run | https://cloud.google.com/run/pricing | Rates via search excerpts citing the page |
| Cloud Logging | https://cloud.google.com/products/observability/pricing | |
| Neon | https://neon.com/pricing · https://neon.com/docs/introduction/scale-to-zero | Fetched |
| Upstash | https://upstash.com/pricing/redis | Fetched |
| Firebase | https://firebase.google.com/pricing | Fetched |
| Twilio SMS Egypt | https://www.twilio.com/en-us/sms/pricing/eg | Fetched twice: **$0.3959** |
| Twilio Verify | https://www.twilio.com/en-us/verify/pricing | Fetched |
| Twilio trial | https://www.twilio.com/docs/usage/trials | Fetched |
| Twilio Egypt guidelines | https://www.twilio.com/en-us/guidelines/eg/sms | Fetched |
| Twilio upgrade/billing | https://help.twilio.com/articles/223183208 · https://help.twilio.com/articles/223135487-How-Twilio-billing-works | **Did not render**; $20 from search excerpts |
| ImageKit | https://imagekit.io/plans/ | Fetched |
| Paymob | https://paymob.com/en/pricing | Fetched |
| Fawry Accept | https://atfawry.com/pricing | First fetch had data; re-fetch returned none |

---

## 26. Validation Pass

### 26.1 Database

| Question | Answer | Label |
|---|---|---|
| Type | **PostgreSQL** (`prisma/migrations/migration_lock.toml`, datasource `provider = "postgresql"`, `CREATE EXTENSION postgis`/`pg_trgm`) | Confirmed |
| Provider | Neon, per `.env.example` comments, `MEMORY.md`, `CLAUDE.md`, File 12 Part 2, `package.json` keyword `neon-postgres`. The `pgbouncer=true` + `DIRECT_URL` pattern matches Neon | **Likely** |
| Dev DB | Local `postgis/postgis:16-3.4` is available (`docker-compose.yml`); actual use Unknown | Unknown |
| Staging DB | The live service's DB is reachable (`/v1/health/ready`); host Unknown | Unknown |
| Dev and staging share a DB? | Needs `.env` + Cloud Run secrets | **Unknown** |
| Neon plan | Needs Neon console | **Unknown** |

### 26.2 Redis

**Used at runtime: Confirmed.** Live `/v1/health/ready` returned `"redis":"ok"`. The code requires it: `REDIS_URL`/`REDIS_ENABLED` are required, `onModuleInit` connects, and production requires `REDIS_ENABLED=true`. **Upstash as the provider can't be proven from the repo** (Unknown).

| Use | Yes/No | Proof |
|---|---|---|
| Rate limiting | **Yes**: OTP + reset (`otp-rate:`), password login (`password-login-rate:`) | `src/modules/identity-auth/infrastructure/phone-rate-limiter.service.ts` (`INCR`/`EXPIRE`); `login-with-password.use-case.ts` |
| Other: idempotency keys | **Yes**: `SET NX EX 30`, then `SET EX 86400` or `DEL`, on 12 routes | `src/shared/core/idempotency/idempotency-key.interceptor.ts` |
| Other: health check | **Yes**: `PING` | `src/health/health.controller.ts` |
| Cache | No | `RedisService.get/set` are only called by the idempotency interceptor |
| Queue / background jobs | No | The outbox is Postgres (`outbox_events`); no BullMQ |
| Sessions | No | Refresh tokens live in Postgres (`refresh_tokens`) |
| Global throttling | No | `ThrottlerModule` uses default in-memory storage (`src/shared/core/core.module.ts`) |

### 26.3 Background Worker

| # | Question | Answer | Label |
|---|---|---|---|
| 1 | API start command | `node dist/main.js` (Dockerfile `CMD`; `npm start`) | Confirmed |
| 2 | Worker start command | `node dist/worker.js` (`npm run start:worker`; `docs/DEPLOYMENT.md`: `docker run … medsuper-api:release node dist/worker.js`) | Confirmed |
| 3 | Can one image run both? | **Yes, by overriding the command.** But see 26.12: at HEAD the committed image can't boot under any `NODE_ENV` | Confirmed |
| 4 | Worker deployed separately? | No deployment files exist | **Unknown** |
| 5 | Cloud Run Job? | Nothing in the repo; `gcloud` unavailable. A Job would also be unsuitable, since the worker is a long-running loop | Unknown |
| 6 | Cloud Run Worker Pool? | Nothing in the repo | Unknown |
| 7 | Other worker infrastructure? | None in the repo. A code comment in `outbox.worker.ts` records the queue being "observed live" stalled for a day, so **a worker has run in some environment at some point** | Unknown / Likely at some point |
| 8 | Running in Development? | Only if a developer runs `npm run start:worker:dev` | Unknown |
| 9 | Running in Staging? | Not observable from public endpoints | **Unknown** |
| 10 | If NOT running | See below | Confirmed (code) |

**Features that depend on the worker:**
1. **All 34 notification templates.** In-app notification rows, FCM push, and the 3 SMS-channel templates. Without the worker, `GET /v1/notifications` stays empty and no push is sent.
2. **Appointment hold expiry.** `create-hold.use-case.ts` doesn't reap expired holds, so an abandoned 5-minute hold blocks its slot indefinitely (`SLOT_ALREADY_HELD`).
3. **Expiry of online-payment windows**, including the FawryPay `cancel-unpaid-order` call. Without it, an expired Fawry reference could still be paid (though the late-payment webhook path in the API would then auto-refund).
4. **Rolling slot generation.** Bookable slots run out 30 days after the last run. The manual script `npm run db:generate-slots` is the workaround.
5. **Notification retries.**
6. Re-queueing of `SKIPPED` outbox events at boot.

### 26.4 Worker Cost

| Question | Answer |
|---|---|
| Frequency | Outbox every 2 s; holds every 60 s; notification retry every 5 min; slots daily |
| Polls the DB? | **Yes.** About 43,200 outbox transactions/day even with nothing queued |
| Keeps connections alive? | Yes. A Prisma pool and an ioredis connection stay open for the process lifetime |
| Runs continuously? | Yes. A long-running process with no HTTP listener |
| Could be event-driven? | Yes: drain-on-emit or `LISTEN/NOTIFY` for the outbox; Cloud Scheduler for the minute/daily sweeps. This needs code changes |
| DB cost | **Supported by Neon's rules:** compute suspends only after 5 min without active queries, so a 2 s poll means compute never suspends. ≥ 0.25 CU × 730 h = 182.5 CU-h/month > Free's 100. On Launch: ≥ **$19.35/month** |
| Cloud Run cost | Always-on instance-based billing: about $21 (0.5 vCPU) to $44 (1 vCPU) per month after the free tier. Estimated; worker-pool rates Unverified |
| Redis cost | **About $0.** The worker issues Redis commands only on connect. Idle TCP connections aren't billed as commands |

### 26.5 SMS usage by event

| Event | Sends SMS? | Source file | Trigger | Recipient | Status |
|---|---|---|---|---|---|
| OTP login/signup | **Via `OTP_SENDER` → logged only** | `identity-auth/application/request-otp.use-case.ts` → `infrastructure/logging-otp-sender.ts` | `POST /v1/auth/otp/request` | The phone entered (patient) | Implemented; **real SMS planned** (Twilio). Not env-dependent: always the logger |
| Password reset | **Via `OTP_SENDER` → logged only** | `forgot-password.use-case.ts` (reuses `RequestOtpUseCase`) | `POST /v1/auth/password/forgot` | The phone entered (**any number, account or not**) | Same as above |
| AppointmentConfirmed | Channel list includes `SMS` → `LoggingSmsSender` (log only) | `notifications/domain/notification-templates.ts`; `application/deliver-notification.use-case.ts`; `infrastructure/logging-sms-sender.ts` | Outbox event on appointment confirm (worker) | Patient | Implemented to the placeholder. ⚠ **Existing implementation differs from intended MVP scope** |
| AppointmentCancelled | Same | Same | Outbox event on cancel (worker) | Patient | ⚠ **Existing implementation differs from intended MVP scope** |
| CriticalLabResult | Same | Same; emitted by `laboratory/application/set-critical-flag.use-case.ts` | Lab staff flags a result critical (worker) | Patient | ⚠ **Existing implementation differs from intended MVP scope** |

- No feature flags exist.
- The only per-user control is `notification_preferences`: the SMS channel can be opted out for `TRANSACTIONAL`, but **not** for `SAFETY_CRITICAL`.
- Notification SMS only happens when the worker runs.
- **No real SMS is sent anywhere today.**

### 26.6 Twilio OTP compatibility

- Generation, storage, verification, expiry, attempts, and rate limits are covered in Section 9.1.
- **Programmable Messaging is compatible without changing the authentication architecture.** `OtpSenderPort.send(phone, code)` is exactly "deliver this text to this number". Only a new adapter, the DI binding at `identity-auth.module.ts:109`, and removal of the OTP blocker in `env.validation.ts` are needed.
- Verify would require restructuring 4 use-cases.

### 26.7 SMS abuse protection

**Existing protections:**
- (a) `PhoneRateLimiterService`: 3 requests per 10 min per phone, **shared** between login OTP and reset.
- (b) Global `ThrottlerGuard`: 100 requests per 60 s per IP, **in-memory, per Cloud Run instance**. There's no stricter `@Throttle` on `/otp/request` or `/password/forgot`.
- (c) DTO regex: Egyptian mobile numbers only.
- (d) 5 wrong-code attempts per code (protects the code, not the cost).

| Pattern | Protected? | Why |
|---|---|---|
| One phone, many OTPs | **Partly.** Max 3 per 10 min = **432 SMS/day ≈ $171/day per phone**, with no daily cap | (a) |
| One IP, many OTPs | **Weakly.** Up to 100/min per instance, spread across different phones; more instances multiply this | (b) only |
| Distributed IPs | **No** | (b) is per IP per instance |
| Many Egyptian numbers | **No.** (c) restricts country, not volume. Pumping inside Egypt is still possible | — |
| Password reset abuse | **No extra protection.** Same limits as OTP, and it **sends to numbers without accounts** | `forgot-password.use-case.ts` |
| Notification-trigger abuse | Not a Twilio cost under intended scope. If Twilio were bound to `SMS_SENDER`, a patient booking and cancelling repeatedly would trigger SMS each time | `notification-templates.ts` |

**Patterns that can still cause large SMS bills:** scripted requests across many Egyptian numbers from several IPs against `/otp/request` and `/password/forgot`. The only hard stop today would be the Twilio prepaid balance.

### 26.8 Twilio pricing verification

| Item | Result | Label |
|---|---|---|
| Egypt SMS price | **$0.3959** per message, charged per segment. Re-fetched 2026-09-30 | **Confirmed** (official page) |
| Programmable Messaging | Same rate + $0.001 per "Failed" message | Confirmed |
| Verify | $0.05 per successful verification + channel fee. Attempts always charged. Egypt channel fee not shown | Confirmed / Egypt channel **Unverified** |
| Failed/undelivered | Failed status: $0.001. Sent-but-undelivered: charged | Confirmed |
| Trial | 5 verified recipients, templates only, 100 SMS / 40 verifications, sign-up country only | Confirmed |
| $20 minimum deposit | Stated in Twilio help-centre search excerpts; the article pages didn't render | **Unverified (Likely)** |
| Auto-recharge / suspended at $0 | Same sources | **Unverified (Likely)** |
| Spending limits | No hard cap found; the prepaid balance acts as the cap | **Unverified** |

### 26.9 Fawry pricing

999 EGP setup and 499 EGP monthly minimum: found once on https://atfawry.com/pricing (Fawry Accept); a same-day re-fetch returned no content. **Published price found, applicability to MedSuper integration requires Fawry confirmation.** Not treated as a confirmed project cost.

### 26.10 Payment scope conflicts

| Finding | Evidence | Impact |
|---|---|---|
| Wallet top-up requires Card | `src/modules/payments/application/initiate-wallet-top-up.use-case.ts:65` → `method: 'CARD'`; README: "`POST /v1/wallet/top-up` (card-only)" | With Card out of scope, **the MedSuper Wallet can't be funded online**. It can only receive refunds from cancellations |
| Appointment Card still accepted | `src/modules/scheduling-appointments/api/dto/initiate-online-appointment-payment.dto.ts:7` → `ONLINE_METHODS = ['CARD','FAWRY','MOBILE_WALLET']` | Card payments work as soon as Paymob credentials exist (if `PAYMOB_INTEGRATION_ID_CARD`/`IFRAME_ID` are set). This contradicts the scope |
| Card out of MVP scope | **Product statement only**; no code, config, or flag disables it | Needs a code or config decision |
| Online refunds not sent to gateway | `src/modules/payments/application/process-cancellation-refund.use-case.ts:28-35` (records the `Refund` row; only `INTERNAL_WALLET` moves money, line 107). The gateway `refund()` is called only in `handle-late-payment-after-expiry.use-case.ts:71,109` | Cancelled Fawry or mobile-wallet payments need **manual refunds**. The budget impact is operational, plus Fawry's 3 EGP per refund if confirmed |

### 26.11 Cloud Run

| Item | Repository evidence | External/live evidence |
|---|---|---|
| Region | — | **europe-west1** (Confirmed) |
| Service name | — | `medsuper-api` (Likely) |
| CPU, memory, min/max, concurrency | None | **Unknown** (needs `gcloud`) |
| Port | 3000 default; honours `PORT` | Unknown |
| Env var names | See Section 5 | `CORS_ALLOWED_ORIGINS` unset (Confirmed via CORS probe) |
| Production mode | See 26.12 | **Unknown** |
| Debug logging | See 26.12 | **Unknown** |
| Other live facts | `/v1/docs` Swagger returns 200 publicly; DB and Redis reachable; `x-ratelimit-limit: 100` | Confirmed |

### 26.12 Production OTP safety

**Startup conditions:**
- `src/shared/config/env.validation.ts`: when `NODE_ENV === 'production'`, it always pushes `'a production OTP sender must be selected and configured'` and throws. `src/main.ts` also throws in production without `CORS_ALLOWED_ORIGINS`. Both were added in `ba9b5b1` (2026-09-25).
- `src/shared/core/logging/logging.module.ts`: when not in production, pino uses `transport: { target: 'pino-pretty' }` at level `debug`. `pino-pretty` is a **devDependency** (`package-lock.json`: `"dev": true`), and the `Dockerfile` runs `npm prune --omit=dev`. A local test confirmed that pino 9.14 **throws** `unable to determine transport target` when the target is missing.

**Conclusions:**
- **At HEAD, the committed Docker image can't serve traffic under any `NODE_ENV`.** This is **Likely**: the pino behaviour was tested, but the full container wasn't run.
- The live service works, so it's running a **revision built before 2026-09-25, or built another way** (for example a buildpack deploy that keeps devDependencies). That revision's `NODE_ENV` and log level are **Unknown**. It could be `production` (only possible before the blocker existed) or not.
- v1 of this report stated the live service "can't be production". **That was wrong.** It's Unknown.
- **OTP codes in logs: yes, in every environment.** `LoggingOtpSender` is bound unconditionally (`identity-auth.module.ts:109`) and logs the code at `warn`, which shows at both `info` and `debug`. `LoggingSmsSender` does the same for notification text. `RequestOtpUseCase` also logs phone + IP. This isn't dev-only. It applies to staging and to any production-mode revision built before 2026-09-25.

### 26.13 Final Validation Summary

**CONFIRMED**
- PostgreSQL + PostGIS + pg_trgm. Redis in active use (rate limits, idempotency, health), not a cache/queue/session store.
- Live service in europe-west1; DB and Redis reachable; CORS allowlist unset; Swagger public.
- API/worker commands. No CI, Cloud Run config, Job, or worker-pool definitions in the repo.
- Worker poll cadence (2 s / 1 min / 5 min / daily) and every feature that depends on the worker.
- OTP internals (6 digits, argon2, 300 s, 5 attempts, 3 per 10 min per phone shared with reset). Reset sends via the same sender, even for unknown numbers.
- No SMS provider exists. 3 notification templates list SMS (**differs from intended MVP scope**). All 34 templates use FCM push.
- FCM is free. Twilio Egypt $0.3959/segment. Verify $0.05 + channel. Trial limits. Neon suspension rule.
- Wallet top-up is card-only. Card is accepted for appointments. Cancellation refunds for gateway-paid appointments aren't sent to the gateway.
- OTP codes are logged at `warn` in every environment.

**LIKELY**
- Neon is the DB provider. `medsuper-api` is the service name.
- Twilio $20 minimum deposit, auto-recharge, and suspension at $0.
- The HEAD Docker image can't boot, so the live revision predates or differs from the repo.
- A worker has run somewhere at some point (code comment).

**UNKNOWN**
- Cloud Run CPU, memory, min/max, concurrency, billing mode, `NODE_ENV`, log level, deployed revision/commit, and build method.
- Whether and where the worker runs (dev, staging, prod).
- DB host, Neon plan and region, and dev/staging DB separation.
- Redis provider and plan. ImageKit plan/accounts. Whether Firebase credentials are set.
- GCP billing-account structure; Secret Manager and Artifact Registry usage.

**NEEDS VENDOR CONFIRMATION**
- Twilio: Egypt Verify channel rate; alphanumeric sender registration cost and discounts; spending-cap options.
- Fawry: whether setup and monthly minimum apply to a FawryPay API merchant; VAT; refund fee.
- Paymob: mobile-wallet rate, refund fee, VAT.

**BUDGET-CRITICAL ITEMS**
1. The Twilio OTP + reset volume and message length ($0.3959 per segment dominates the budget).
2. SMS-pumping exposure on `/otp/request` and `/password/forgot` (no per-IP/global cap; reset sends to unknown numbers).
3. Keeping Twilio off `SMS_SENDER` (3 notification templates would otherwise bill per booking).
4. Whether the worker runs 24/7, which sets Neon compute (≥ $19/month) and worker hosting (~$20–$45/month).
5. Cloud Run min-instance settings.
6. Fawry setup and minimum applicability.

### What the MedSuper team must verify before approving the MVP budget

1. **Run `gcloud run services describe medsuper-api --region europe-west1`.** Record CPU, memory, min/max instances, billing mode, `NODE_ENV`, and the deployed image/commit. Confirm how that image was built, since the HEAD `Dockerfile` image can't boot.
2. **Find the worker.** Run `gcloud run worker-pools list`, `gcloud run jobs list`, and check VMs. Decide where it will run in staging and prod, and at what CPU size.
3. **Check the Neon console.** Record the plan, region, and compute size, and whether dev, staging, and prod are separate projects or branches.
4. **Set the OTP forecast.** Monthly OTP logins and password resets, the expected resend rate, and the final SMS text (1 segment, Arabic ≤ 70 characters).
5. **Choose Twilio Option 1 or 2**, and get a Twilio quote for Egypt: alphanumeric sender registration, Verify channel rate, and confirmation of the $20 deposit and auto-recharge terms.
6. **Decide the SMS-abuse budget cap.** Twilio balance/auto-recharge limits, and whether per-IP/global OTP caps and an account-exists check on reset get built before launch.
7. **Confirm the notification scope in code.** The 3 SMS-channel templates become push-only, or `SMS_SENDER` stays unbound from Twilio.
8. **Get the Fawry and Paymob contract terms.** Setup fee, monthly minimum, per-method rates, refund fees, VAT.
9. **Decide on Card.** Disable `CARD` for appointments, and decide how the MedSuper Wallet is funded without it.
10. **Check the Upstash and ImageKit accounts.** Plan, and whether environments share an account.
