import { Inject, Injectable } from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { computeOutstandingEarningBalance, fromCents, toCents } from '../domain/payment-money.rules';
import { ProviderLedgerRepository } from '../infrastructure/provider-ledger.repository';

export interface RecordProviderPayoutInput {
  providerType: ProviderType;
  providerId: string;
  amount: string;
  note?: string;
}

export interface RecordProviderPayoutResult {
  ledgerEntryId: string;
  outstandingBalance: string;
}

/**
 * Admin-only. The actual money transfer to the provider happens OUTSIDE
 * this system (bank transfer, cash, whatever) — this use-case only RECORDS
 * that it happened, by writing a single `PAYOUT` ledger entry (negative
 * amount). Never mutates or deletes any prior `EARNING`/`ADJUSTMENT` row —
 * full financial history is preserved, same "never edit a historical ledger
 * row, write a new one" convention `ProcessCancellationRefundUseCase`
 * already uses for refund reversals.
 *
 * Re-derives the outstanding balance from the ledger inside this same
 * transaction and rejects a payout larger than it — never trusts a
 * client-supplied "current balance," same discipline the codebase already
 * applies to cancellation fees/commission splits.
 */
@Injectable()
export class RecordProviderPayoutUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProviderLedgerRepository) private readonly ledger: ProviderLedgerRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(input: RecordProviderPayoutInput, actor: AccessTokenPayload): Promise<RecordProviderPayoutResult> {
    if (toCents(input.amount) <= 0) {
      throw new BusinessRuleError('VALIDATION_ERROR', 'قيمة الدفعة يجب أن تكون أكبر من صفر.');
    }

    return this.prisma.$transaction(async (tx) => {
      const entries = await this.ledger.findAllByProvider(tx, { providerType: input.providerType, providerId: input.providerId });
      const outstandingBefore = computeOutstandingEarningBalance(
        entries.map((entry) => ({
          entryType: entry.entry_type,
          amount: entry.amount.toString(),
          relatedPaymentIntentId: entry.related_payment_intent_id,
        })),
      );

      if (toCents(input.amount) > toCents(outstandingBefore)) {
        throw new BusinessRuleError(
          'PAYOUT_EXCEEDS_OUTSTANDING_BALANCE',
          'المبلغ المطلوب تحويله أكبر من الرصيد المستحق لمقدّم الخدمة.',
          { outstandingBalance: outstandingBefore },
        );
      }

      const entry = await this.ledger.create(tx, {
        providerType: input.providerType,
        providerId: input.providerId,
        entryType: 'PAYOUT',
        amount: fromCents(-toCents(input.amount)),
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'payments.provider_ledger.record_payout',
        resourceType: 'provider_ledger_entry',
        resourceId: entry.id,
        reasonCode: input.note,
      });

      return { ledgerEntryId: entry.id, outstandingBalance: fromCents(toCents(outstandingBefore) - toCents(input.amount)) };
    });
  }
}
