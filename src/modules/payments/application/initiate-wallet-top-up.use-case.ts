import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/core/errors/domain-errors';
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
  ) {}

  async execute(input: InitiateWalletTopUpInput): Promise<InitiateWalletTopUpResult> {
    if (!(parseFloat(input.amount) > 0)) {
      throw new DomainError(400, 'INVALID_AMOUNT', 'قيمة الشحن يجب أن تكون أكبر من صفر.');
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallets.getOrCreate(tx, input.userId, 'EGP');
      const walletTransactionId = randomUUID();

      const initiated = await this.initiateOnlinePayment.execute(tx, {
        payerUserId: input.userId,
        payableType: 'WALLET_TOPUP',
        payableId: walletTransactionId,
        amount: input.amount,
        currency: wallet.currency,
        method: 'CARD',
        idempotencyKey: `topup:${walletTransactionId}`,
        customer: input.customer,
      });

      await this.walletTransactions.create(tx, {
        id: walletTransactionId,
        walletId: wallet.id,
        type: 'TOP_UP',
        status: 'PENDING',
        amount: input.amount,
        paymentIntentId: initiated.paymentIntentId,
        idempotencyKey: `topup:${walletTransactionId}`,
      });

      return { walletTransactionId, paymentIntentId: initiated.paymentIntentId, redirectUrl: initiated.redirectUrl as string };
    });
  }
}
