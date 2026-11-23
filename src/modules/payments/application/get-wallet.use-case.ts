import { Inject, Injectable } from '@nestjs/common';
import { PAYMENT_CONSTANTS } from '../../../shared/config/constants';
import { ServiceFeeReader } from '../../../shared/kernel/policy-config/service-fee.reader';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { computeMinWithdrawal } from '../domain/withdrawal.rules';
import { WalletRepository } from '../infrastructure/wallet.repository';

export interface WalletSummary {
  walletId: string;
  balance: string;
  currency: string;
  /** Current flat service fee (decimal string). */
  serviceFee: string;
  /** Smallest withdrawal allowed right now (derived from the service fee). */
  minWithdrawal: string;
  /** Top-up limits: min = service fee. */
  topUpMin: string;
  topUpMaxPerOperation: string;
  topUpMaxDaily: string;
}

/** File 12 Part 50.3 `GET /v1/wallet` — a wallet that doesn't exist yet (never topped up) is reported as a zero balance, not `404`, since every user is conceptually entitled to one. */
@Injectable()
export class GetWalletUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WalletRepository) private readonly wallets: WalletRepository,
    @Inject(ServiceFeeReader) private readonly serviceFeeReader: ServiceFeeReader,
  ) {}

  async execute(userId: string): Promise<WalletSummary> {
    const [wallet, fee] = await Promise.all([this.wallets.findByUserId(this.prisma, userId), this.serviceFeeReader.get(this.prisma)]);
    const limits = {
      serviceFee: fee.amount,
      minWithdrawal: computeMinWithdrawal(fee.amount),
      topUpMin: fee.amount,
      topUpMaxPerOperation: PAYMENT_CONSTANTS.TOPUP_MAX_PER_OPERATION.toFixed(2),
      topUpMaxDaily: PAYMENT_CONSTANTS.TOPUP_MAX_DAILY.toFixed(2),
    };
    if (!wallet) {
      return { walletId: '', balance: '0.00', currency: fee.currency, ...limits };
    }
    return { walletId: wallet.id, balance: wallet.balance.toFixed(2), currency: wallet.currency, ...limits };
  }
}
