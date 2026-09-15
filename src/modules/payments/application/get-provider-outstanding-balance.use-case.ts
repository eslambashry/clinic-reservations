import { Inject, Injectable } from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { computeOutstandingEarningBalance } from '../domain/payment-money.rules';
import { ProviderLedgerRepository } from '../infrastructure/provider-ledger.repository';

export interface GetProviderOutstandingBalanceResult {
  providerType: ProviderType;
  providerId: string;
  outstandingBalance: string;
}

/**
 * Admin-only read: how much MedSuper currently owes a provider (doctor
 * today — pharmacy/lab never produce an EARNING entry under the
 * pay-at-clinic/pay-at-lab-only model, so this would just report "0.00" for
 * them). Plain `PrismaService` read, not `tx`-scoped — same
 * "authorization/reporting lookup" reasoning as `GetActiveRoleMembershipUseCase`.
 */
@Injectable()
export class GetProviderOutstandingBalanceUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProviderLedgerRepository) private readonly ledger: ProviderLedgerRepository,
  ) {}

  async execute(providerType: ProviderType, providerId: string): Promise<GetProviderOutstandingBalanceResult> {
    const entries = await this.ledger.findAllByProvider(this.prisma, { providerType, providerId });
    const outstandingBalance = computeOutstandingEarningBalance(
      entries.map((entry) => ({
        entryType: entry.entry_type,
        amount: entry.amount.toString(),
        relatedPaymentIntentId: entry.related_payment_intent_id,
      })),
    );
    return { providerType, providerId, outstandingBalance };
  }
}
