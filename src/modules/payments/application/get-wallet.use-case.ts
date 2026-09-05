import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { WalletRepository } from '../infrastructure/wallet.repository';

export interface WalletSummary {
  walletId: string;
  balance: string;
  currency: string;
}

/** File 12 Part 50.3 `GET /v1/wallet` — a wallet that doesn't exist yet (never topped up) is reported as a zero balance, not `404`, since every user is conceptually entitled to one. */
@Injectable()
export class GetWalletUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WalletRepository) private readonly wallets: WalletRepository,
  ) {}

  async execute(userId: string): Promise<WalletSummary> {
    const wallet = await this.wallets.findByUserId(this.prisma, userId);
    if (!wallet) {
      return { walletId: '', balance: '0.00', currency: 'EGP' };
    }
    return { walletId: wallet.id, balance: wallet.balance.toFixed(2), currency: wallet.currency };
  }
}
