import { Injectable } from '@nestjs/common';
import { LedgerEntryType, Prisma, ProviderLedgerEntry, ProviderType } from '@prisma/client';

export interface NewLedgerEntry {
  providerType: ProviderType;
  providerId: string;
  entryType: LedgerEntryType;
  amount: string;
  relatedPaymentIntentId?: string;
}

@Injectable()
export class ProviderLedgerRepository {
  create(db: Prisma.TransactionClient, input: NewLedgerEntry): Promise<ProviderLedgerEntry> {
    return db.providerLedgerEntry.create({
      data: {
        provider_type: input.providerType,
        provider_id: input.providerId,
        entry_type: input.entryType,
        amount: input.amount,
        related_payment_intent_id: input.relatedPaymentIntentId,
      },
    });
  }

  findByRelatedPaymentIntentId(db: Prisma.TransactionClient, paymentIntentId: string): Promise<ProviderLedgerEntry[]> {
    return db.providerLedgerEntry.findMany({ where: { related_payment_intent_id: paymentIntentId } });
  }
}
