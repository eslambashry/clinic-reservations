import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/core/errors/domain-errors';
import { PAYMENT_CONSTANTS } from '../../../shared/config/constants';
import { ServiceFeeReader } from '../../../shared/kernel/policy-config/service-fee.reader';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { InitiateOnlinePaymentUseCase } from './initiate-online-payment.use-case';
import { PaymentCustomerInfo } from './ports/payment-gateway.port';
import { WalletRepository } from '../infrastructure/wallet.repository';
import { WalletTransactionRepository } from '../infrastructure/wallet-transaction.repository';

export interface InitiateWalletTopUpInput {
  userId: string;
  amount: string;
  customer: PaymentCustomerInfo;
}

export interface InitiateWalletTopUpResult {
  walletTransactionId: string;
  paymentIntentId: string;
  redirectUrl: string;
}

/**
 * File 12 Part 50.3 `POST /v1/wallet/top-up` — card-only, per the business
 * requirement ("Top up the wallet using a Card"). Creates a `PENDING`
 * `WalletTransaction` and a `CREATED` `PaymentIntent`/`PaymentAttempt` in
 * one transaction, then hands the client the Paymob iframe URL; the wallet
 * balance itself is untouched until `ProcessWalletTopUpUseCase` runs off a
 * verified capture webhook (never here — "do not simply increase the
 * wallet balance before the payment is confirmed").
 */
@Injectable()
export class InitiateWalletTopUpUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WalletRepository) private readonly wallets: WalletRepository,
    @Inject(WalletTransactionRepository) private readonly walletTransactions: WalletTransactionRepository,
    @Inject(InitiateOnlinePaymentUseCase) private readonly initiateOnlinePayment: InitiateOnlinePaymentUseCase,
    @Inject(ServiceFeeReader) private readonly serviceFee: ServiceFeeReader,
  ) {}

  async execute(input: InitiateWalletTopUpInput): Promise<InitiateWalletTopUpResult> {
    if (!(parseFloat(input.amount) > 0)) {
      throw new DomainError(400, 'INVALID_AMOUNT', 'قيمة الشحن يجب أن تكون أكبر من صفر.');
    }

    // The gateway call (`callGateway` below) is a live network round trip —
    // even the CARD-only flow this use-case uses is several sequential HTTP
    // calls — that must never run inside a `$transaction` (it can exceed
    // Prisma's ~5s interactive-transaction timeout). Prepare/persist first,
    // call the gateway with no transaction open, then persist the outcome.
    const { walletTransactionId, prepared } = await this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallets.getOrCreate(tx, input.userId, 'EGP');

      // Limits: min = current service fee, max per operation and max per rolling 24h are constants.
      const fee = await this.serviceFee.get(tx);
      const requested = Number(input.amount);
      if (requested < Number(fee.amount)) {
        throw new DomainError(422, 'TOPUP_BELOW_MINIMUM', `الحد الأدنى للشحن هو ${fee.amount} ${fee.currency}.`, { minAmount: fee.amount });
      }
      if (requested > PAYMENT_CONSTANTS.TOPUP_MAX_PER_OPERATION) {
        throw new DomainError(422, 'TOPUP_ABOVE_MAX_PER_OPERATION', `الحد الأقصى للشحن في العملية الواحدة هو ${PAYMENT_CONSTANTS.TOPUP_MAX_PER_OPERATION} ${fee.currency}.`, {
          maxAmount: PAYMENT_CONSTANTS.TOPUP_MAX_PER_OPERATION.toFixed(2),
        });
      }
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const alreadyToday = Number(await this.walletTransactions.sumTopUpsSince(tx, wallet.id, since));
      if (alreadyToday + requested > PAYMENT_CONSTANTS.TOPUP_MAX_DAILY) {
        throw new DomainError(422, 'TOPUP_DAILY_LIMIT_EXCEEDED', `تجاوزت الحد الأقصى اليومي للشحن (${PAYMENT_CONSTANTS.TOPUP_MAX_DAILY} ${fee.currency}).`, {
          maxDaily: PAYMENT_CONSTANTS.TOPUP_MAX_DAILY.toFixed(2),
          usedLast24h: alreadyToday.toFixed(2),
        });
      }
      const walletTransactionId = randomUUID();
      // File 12 Part 51: computed once, reused for both the gateway call
      // below and (if a future use-case ever needs to expire a stale
      // top-up attempt) would be the same deadline that decision reads.
      const expiresAt = new Date(Date.now() + PAYMENT_CONSTANTS.WALLET_TOPUP_WINDOW_MINUTES * 60 * 1000);

      const prepared = await this.initiateOnlinePayment.prepare(tx, {
        payerUserId: input.userId,
        payableType: 'WALLET_TOPUP',
        payableId: walletTransactionId,
        amount: input.amount,
        currency: wallet.currency,
        method: 'CARD',
        idempotencyKey: `topup:${walletTransactionId}`,
        customer: input.customer,
        expiresAt,
      });

      await this.walletTransactions.create(tx, {
        id: walletTransactionId,
        walletId: wallet.id,
        type: 'TOP_UP',
        status: 'PENDING',
        amount: input.amount,
        paymentIntentId: prepared.paymentIntentId,
        idempotencyKey: `topup:${walletTransactionId}`,
      });

      return { walletTransactionId, prepared };
    });

    let gatewayResult;
    try {
      gatewayResult = await this.initiateOnlinePayment.callGateway(prepared);
    } catch (error) {
      await this.prisma.$transaction((tx) => this.initiateOnlinePayment.completeFailure(tx, prepared.paymentAttemptId));
      throw error;
    }

    await this.prisma.$transaction((tx) => this.initiateOnlinePayment.completeSuccess(tx, prepared.paymentAttemptId, gatewayResult.metadata));

    return { walletTransactionId, paymentIntentId: prepared.paymentIntentId, redirectUrl: gatewayResult.redirectUrl as string };
  }
}
