# Frontend guide: what changed in appointment payments

Covers two backend changes: **direct Fawry payments** and **partial appointment payment** (pay from a minimum of 50 EGP up to the full fee).

- Base path: `/v1`. Auth: `Authorization: Bearer <accessToken>`.
- Success envelope: `{ "success": true, "data": { ... }, "requestId": "...", "correlationId": "..." }`
- Error envelope: `{ "success": false, "error": { "code": "...", "message": "<Arabic>", "details": { ... }, "requestId": "...", "correlationId": "..." } }`
- Every money value in a request or response is a **string** with up to 2 decimals (`"50.00"`), never a JSON number. A number gets `400 VALIDATION_ERROR`.
- Mutating calls keep using the `Idempotency-Key` header as before.

## TL;DR

| Area | Change for the app |
|---|---|
| `POST /v1/appointments/{holdId}/payments` | New optional body field `paymentAmount`. Fawry now returns a real Fawry `referenceCode`. |
| `POST /v1/appointments/{holdId}/confirm` | New optional body field `paymentAmount`, **INTERNAL_WALLET only**. |
| New error codes | 5 codes, see the error table. |
| Pay-at-clinic | **Unchanged.** Sending `paymentAmount` with it is rejected. |
| Cancel, refund, wallet, notifications endpoints | Same shapes. The amounts they show are now the amount actually paid. |
| Admin | `MIN_APPOINTMENT_PAYMENT` is a new policy type on the existing `policy-configs` endpoints. |

Nothing else was renamed or removed. Old clients that never send `paymentAmount` behave exactly as before (pay the full fee).

---

## 1. Initiate an online payment (card, Fawry, mobile wallet)

`POST /v1/appointments/{holdId}/payments`, PATIENT role.

**Request**
```json
{
  "method": "FAWRY",
  "customer": { "firstName": "Sara", "lastName": "Ahmed", "email": "sara@example.com", "phone": "+201000000000" },
  "paymentAmount": "50.00"
}
```
| Field | Required | Notes |
|---|---|---|
| `method` | yes | `CARD`, `FAWRY` or `MOBILE_WALLET` |
| `customer` | yes | Unchanged |
| `walletProvider`, `walletMobileNumber` | only for `MOBILE_WALLET` | Unchanged |
| **`paymentAmount`** | **no (new)** | Omit to pay the full fee. See the amount rules below. |

**Response** `200`
```json
{
  "success": true,
  "data": {
    "paymentIntentId": "uuid",
    "method": "FAWRY",
    "referenceCode": "963455678",
    "expiresAt": "2026-09-21T10:15:00.000Z"
  }
}
```
| Method | What comes back | What the app does |
|---|---|---|
| `CARD` | `redirectUrl` | Open the hosted card page |
| `MOBILE_WALLET` | `redirectUrl` | Send the patient to approve in the wallet app |
| `FAWRY` | `referenceCode` (no `redirectUrl`) | Show the code |

- **Fawry:** show "Fawry code: {referenceCode}". The patient pays at any Fawry outlet or in the myFawry app.
- **The response does not echo the amount.** Show the amount your UI sent (or the full fee if none was sent).
- **Payment confirmation is asynchronous:** the appointment is created only when the gateway confirms payment, never by this call. Track it by polling the appointment or by the `PaymentCaptured` / `PaymentFailed` push notifications.
- **Unpaid Fawry code:** when `expiresAt` passes with no payment, the hold is released and the code is cancelled on Fawry's side. Fawry's hold window is 15 minutes, mobile wallet 10, card 5.
- **Retry:** call the same endpoint again on the same hold. The amount of the first attempt is kept, and any different `paymentAmount` sent on a retry is ignored.

## 2. Confirm with the internal wallet or pay at clinic

`POST /v1/appointments/{holdId}/confirm`, PATIENT role.

**Request**
```json
{ "paymentMethod": "INTERNAL_WALLET", "paymentAmount": "50.00" }
```
| Field | Notes |
|---|---|
| `paymentMethod` | `PAY_AT_CLINIC` or `INTERNAL_WALLET` (`ONLINE` is still rejected, use endpoint 1) |
| **`paymentAmount`** | **New, optional. Only with `INTERNAL_WALLET`.** Only this amount is debited from the wallet. |

**Response** `200`: `{ "appointmentId": "uuid", "status": "CONFIRMED" }`, unchanged.

`PAY_AT_CLINIC` with a `paymentAmount` returns `422 PAYMENT_AMOUNT_NOT_SUPPORTED`. Do not show a partial-amount input for pay-at-clinic.

## 3. Amount rules (server-enforced)

The client only proposes an amount. The fee and the minimum always come from the server.

`min(50, consultationFee) <= paymentAmount <= consultationFee`

| Fee | Allowed | Rejected |
|---|---|---|
| 500 | 50.00 to 500.00 | 49.99 (below minimum), 500.01 (above fee) |
| 300 | 50.00 to 300.00 | same pattern |
| 40 | exactly 40.00 (the minimum is capped at the fee) | 39.99 |

- Also rejected: `0`, negative values, non-numeric text, more than 2 decimals.
- `paymentAmount` omitted, or equal to the fee: paid in full.
- Do not send the fee or a "remaining balance" from the client. Extra fields are rejected with `400`.
- You can read the current minimum from the admin policy, but the backend does not expose it to patients yet. **If the app needs to display or pre-validate the 50 EGP minimum, ask the backend team for a patient-readable value** rather than hardcoding it.

## 4. Errors to handle

| HTTP | `error.code` | When | Suggested UX |
|---|---|---|---|
| 422 | `PAYMENT_AMOUNT_BELOW_MINIMUM` | Below the minimum (`details.minAmount`) | Inline field error, show the minimum |
| 422 | `PAYMENT_AMOUNT_EXCEEDS_FEE` | Above the fee (`details.fullAmount`) | Inline field error |
| 422 | `PAYMENT_AMOUNT_INVALID` | Zero, negative, malformed or non-numeric | Inline field error |
| 422 | `PAYMENT_AMOUNT_NOT_SUPPORTED` | `paymentAmount` sent with `PAY_AT_CLINIC` | Programming error, hide the field |
| 500 | `MIN_APPOINTMENT_PAYMENT_NOT_CONFIGURED` | Minimum not set up for the region. Only happens for a partial amount, never for a full payment. | Generic "try again / contact support" |
| 500 | `PAYMENT_GATEWAY_NOT_CONFIGURED` | Fawry (or Paymob) credentials not set on the server | Generic error |
| 410 | `HOLD_EXPIRED` | Hold gone or already used | Start a new booking |
| 422 | `INSUFFICIENT_WALLET_BALANCE` | Wallet too low for the chosen amount | Offer top-up |

Messages come back in Arabic in `error.message`. Show them as-is.

## 5. What did not change

- **Pay-at-clinic:** captures the full fee as before.
- **Cancel** `POST /v1/appointments/{id}/cancel`: same request and response (`refundAmount`, `feeApplied`). Both figures are based on what the patient actually paid. Example: 500 fee, 50 paid, existing 10% cancellation fee gives `refundAmount: 45`, `feeApplied: 5`. The unpaid balance is never refunded because it was never charged.
- **Wallet endpoints, notifications endpoints:** unchanged. `PaymentCaptured` and refund notifications show the amount actually paid.
- **Fee display:** the doctor's consultation fee on search and detail screens is still the full fee.

## 6. Remaining balance: not visible yet

The backend now stores, for each appointment, the unpaid part of the fee (500 fee, 50 paid gives 450). **No GET endpoint returns it yet.** It is tracking only, and there is no flow for the clinic to collect it. If a screen needs it, ask backend to add it to the appointment response.

## 7. Admin dashboard

`GET /v1/policy-configs` and `PUT /v1/policy-configs/{policyType}` (ADMIN only) now accept a new policy type, **`MIN_APPOINTMENT_PAYMENT`**.

```json
PUT /v1/policy-configs/MIN_APPOINTMENT_PAYMENT
{ "regionCode": "EG", "value": { "minAmount": "50.00" } }
```
- `minAmount` must be a positive decimal **string** with at most 2 decimals. `"0"`, `"abc"` and negatives return `422 POLICY_VALUE_INVALID`.
- Each `PUT` appends a new effective row, and every change is audited.

Login for the admin dashboard (unchanged): `POST /v1/auth/password/login` with `{ "phone": "...", "password": "..." }`, then send `Authorization: Bearer <accessToken>`. The token lasts 30 minutes.

## 8. Backend-to-gateway webhooks (the app never calls these)

For whoever configures the gateway dashboards:
- Paymob: `POST /v1/webhooks/payments/paymob?hmac=...`
- Fawry: `POST /v1/webhooks/payments/fawry`. The signature is inside the JSON body (`messageSignature`), not in a query parameter.

These are public endpoints authenticated by signature only.

## 9. Availability notes

- Partial amounts start working once the backend database migration and the `MIN_APPOINTMENT_PAYMENT` policy row are deployed. Before that, a partial amount returns `500 MIN_APPOINTMENT_PAYMENT_NOT_CONFIGURED`. Full payments work in all cases.
- Fawry works once FawryPay merchant credentials are configured on the server. Until then, `FAWRY` returns `500 PAYMENT_GATEWAY_NOT_CONFIGURED`. Card and mobile wallet are unaffected.
