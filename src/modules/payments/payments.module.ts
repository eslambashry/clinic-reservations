import { Module } from '@nestjs/common';
import { FinanceController } from './api/finance.controller';
// DISABLED TEMPORARILY: هذه الميزة ملغاة بشكل مؤقت حاليا
// import { ProviderPayoutsController } from './api/provider-payouts.controller';
import { WithdrawalsController } from './api/withdrawals.controller';
import { WalletController } from './api/wallet.controller';
import { CancelOnlinePaymentIntentUseCase } from './application/cancel-online-payment-intent.use-case';
import { CaptureInternalWalletPaymentUseCase } from './application/capture-internal-wallet-payment.use-case';
import { CaptureOnlinePaymentUseCase } from './application/capture-online-payment.use-case';
import { CapturePayAtClinicPaymentUseCase } from './application/capture-pay-at-clinic-payment.use-case';
import { FindPaymentByGatewayReferenceUseCase } from './application/find-payment-by-gateway-reference.use-case';
import { GetFinanceSummaryUseCase } from './application/get-finance-summary.use-case';
import { GetProviderOutstandingBalanceUseCase } from './application/get-provider-outstanding-balance.use-case';
import { GetWalletUseCase } from './application/get-wallet.use-case';
import { HandleLatePaymentAfterExpiryUseCase } from './application/handle-late-payment-after-expiry.use-case';
import { InitiateOnlinePaymentUseCase } from './application/initiate-online-payment.use-case';
import { InitiateWalletTopUpUseCase } from './application/initiate-wallet-top-up.use-case';
import { ListProviderLedgerEntriesUseCase } from './application/list-provider-ledger-entries.use-case';
import { ListWalletTransactionsUseCase } from './application/list-wallet-transactions.use-case';
import { MarkOnlinePaymentFailedUseCase } from './application/mark-online-payment-failed.use-case';
import { FAWRY_GATEWAY } from './application/ports/fawry-gateway.port';
import { PAYMENT_GATEWAY } from './application/ports/payment-gateway.port';
import { ProcessCancellationRefundUseCase } from './application/process-cancellation-refund.use-case';
import { ProcessWalletTopUpUseCase } from './application/process-wallet-top-up.use-case';
import { AdminWithdrawalsUseCase } from './application/admin-withdrawals.use-case';
import { ManageMyWithdrawalsUseCase } from './application/manage-my-withdrawals.use-case';
import { RequestWithdrawalUseCase } from './application/request-withdrawal.use-case';
import { ReturnWithdrawalToWalletUseCase } from './application/return-withdrawal-to-wallet.use-case';
import { WithdrawalRequestRepository } from './infrastructure/withdrawal-request.repository';
import { RecordProviderPayoutUseCase } from './application/record-provider-payout.use-case';
import { FawryPaymentGatewayAdapter } from './infrastructure/fawry-payment-gateway.adapter';
import { PaymentAttemptRepository } from './infrastructure/payment-attempt.repository';
import { PaymentIntentRepository } from './infrastructure/payment-intent.repository';
import { PaymentSplitRepository } from './infrastructure/payment-split.repository';
import { PaymobPaymentGatewayAdapter } from './infrastructure/paymob-payment-gateway.adapter';
import { ProviderLedgerRepository } from './infrastructure/provider-ledger.repository';
import { RefundRepository } from './infrastructure/refund.repository';
import { WalletRepository } from './infrastructure/wallet.repository';
import { WalletTransactionRepository } from './infrastructure/wallet-transaction.repository';
import { AuditModule } from '../audit/audit.module';

/**
 * File 11 Part 03/13: owns `payment_intents`, `payment_attempts`,
 * `payment_splits`, `refunds`, `provider_ledger_entries`, `wallets`,
 * `wallet_transactions` — no other module reaches into these tables
 * directly (File 12 Part 05).
 *
 * File 12 Part 50 (Phase 9, DEC-001 = Paymob): adds the online-gateway
 * (`CARD`/`FAWRY`/`MOBILE_WALLET`) and `INTERNAL_WALLET` payment paths
 * alongside the pre-existing pay-at-clinic ledger mechanics, which are
 * untouched. `WalletController` is the wallet's own HTTP surface
 * (patient-facing top-up/balance/history); everything else here is
 * exported for `scheduling-appointments` to call from inside its own
 * transactions, exactly like `CapturePayAtClinicPaymentUseCase`/
 * `ProcessCancellationRefundUseCase` already were — that module hosts the
 * payment webhook controller (`POST /v1/webhooks/payments/:provider`)
 * specifically because it's the one direction that already depends on this
 * module (avoids a circular module import; see its own doc comment).
 *
 * `ProviderPayoutsController` (Admin-only): the outstanding-balance/payout
 * feature — reads `ProviderLedgerEntry` back into a balance and records that
 * Admin transferred money to a provider outside the system (no schema
 * change: reuses the already-reserved `PAYOUT` ledger entry type). Needs
 * `AuditModule` for the first time in this module, since recording a payout
 * is audited like any other admin action.
 *
 * `FAWRY_GATEWAY`/`FawryPaymentGatewayAdapter`: `FAWRY` moved off Paymob to
 * a direct FawryPay integration — Paymob's current docs no longer show
 * Fawry as a supported method (see `PaymentGatewayPort`'s doc comment).
 * File 12 Part 55 (2026-10-05) moved `MOBILE_WALLET` there too (Fawry
 * MWALLET Request-to-Pay); `PAYMENT_GATEWAY` (Paymob) is card only now.
 * Exported the same way `PAYMENT_GATEWAY` already was, for the same callers.
 */
@Module({
  imports: [AuditModule],
  // DISABLED TEMPORARILY: هذه الميزة ملغاة بشكل مؤقت حاليا
  // controllers: [WalletController, FinanceController, ProviderPayoutsController],
  controllers: [WalletController, FinanceController, WithdrawalsController],
  providers: [
    PaymentIntentRepository,
    PaymentAttemptRepository,
    PaymentSplitRepository,
    RefundRepository,
    ProviderLedgerRepository,
    WalletRepository,
    WalletTransactionRepository,
    { provide: PAYMENT_GATEWAY, useClass: PaymobPaymentGatewayAdapter },
    { provide: FAWRY_GATEWAY, useClass: FawryPaymentGatewayAdapter },
    CapturePayAtClinicPaymentUseCase,
    ProcessCancellationRefundUseCase,
    InitiateOnlinePaymentUseCase,
    CaptureOnlinePaymentUseCase,
    MarkOnlinePaymentFailedUseCase,
    FindPaymentByGatewayReferenceUseCase,
    HandleLatePaymentAfterExpiryUseCase,
    CaptureInternalWalletPaymentUseCase,
    ProcessWalletTopUpUseCase,
    CancelOnlinePaymentIntentUseCase,
    InitiateWalletTopUpUseCase,
    GetWalletUseCase,
    ListWalletTransactionsUseCase,
    GetFinanceSummaryUseCase,
    ListProviderLedgerEntriesUseCase,
    GetProviderOutstandingBalanceUseCase,
    RecordProviderPayoutUseCase,
    WithdrawalRequestRepository,
    RequestWithdrawalUseCase,
    ManageMyWithdrawalsUseCase,
    AdminWithdrawalsUseCase,
    ReturnWithdrawalToWalletUseCase,
  ],
  exports: [
    PAYMENT_GATEWAY,
    FAWRY_GATEWAY,
    CapturePayAtClinicPaymentUseCase,
    ProcessCancellationRefundUseCase,
    InitiateOnlinePaymentUseCase,
    CaptureOnlinePaymentUseCase,
    MarkOnlinePaymentFailedUseCase,
    FindPaymentByGatewayReferenceUseCase,
    HandleLatePaymentAfterExpiryUseCase,
    CaptureInternalWalletPaymentUseCase,
    ProcessWalletTopUpUseCase,
    CancelOnlinePaymentIntentUseCase,
  ],
})
export class PaymentsModule {}
