import { Module } from '@nestjs/common';
import { CapturePayAtClinicPaymentUseCase } from './application/capture-pay-at-clinic-payment.use-case';
import { ProcessCancellationRefundUseCase } from './application/process-cancellation-refund.use-case';
import { PaymentIntentRepository } from './infrastructure/payment-intent.repository';
import { PaymentSplitRepository } from './infrastructure/payment-split.repository';
import { ProviderLedgerRepository } from './infrastructure/provider-ledger.repository';
import { RefundRepository } from './infrastructure/refund.repository';

/**
 * File 11 Part 03/13: owns `payment_intents`, `payment_attempts`,
 * `payment_splits`, `refunds`, `provider_ledger_entries` — no other module
 * reaches into these tables directly (File 12 Part 05). File 12 Part 10:
 * pay-at-clinic ledger mechanics only this phase — no gateway integration
 * (`DEC-001` stays open), so no controller exists yet. Exports
 * `CapturePayAtClinicPaymentUseCase`/`ProcessCancellationRefundUseCase` for
 * `scheduling-appointments` to call from inside its own transactions (File
 * 12 Part 36.3 — both take an explicit `tx`, unlike a typical exported
 * use-case). No `imports` needed: `PolicyConfigReader`/`OutboxService` are
 * both `@Global()`.
 */
@Module({
  providers: [
    PaymentIntentRepository,
    PaymentSplitRepository,
    RefundRepository,
    ProviderLedgerRepository,
    CapturePayAtClinicPaymentUseCase,
    ProcessCancellationRefundUseCase,
  ],
  exports: [CapturePayAtClinicPaymentUseCase, ProcessCancellationRefundUseCase],
})
export class PaymentsModule {}
