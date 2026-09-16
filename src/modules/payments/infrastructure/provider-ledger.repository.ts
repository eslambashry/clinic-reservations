import { Injectable } from '@nestjs/common';
import { LedgerEntryType, Prisma, ProviderLedgerEntry, ProviderType } from '@prisma/client';

export interface ListLedgerEntriesFilter {
  providerType?: ProviderType;
  providerId?: string;
  entryType?: LedgerEntryType;
  cursor?: { createdAt: Date; id: string };
  limit: number;
  /** Offset mode (admin console only) — when set, the cursor branch is skipped. */
  skip?: number;
}

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

  /**
   * Keyset read for the ADMIN finance console. Ordered by `(created_at,
   * id)` desc — `id` is the tiebreaker because several entries (an
   * `EARNING` and its `COMMISSION_DEDUCTION`) are written in the same
   * transaction and therefore share a `created_at`, which would otherwise
   * make the cursor skip or repeat rows at a page boundary.
   */
  list(db: Prisma.TransactionClient, filter: ListLedgerEntriesFilter): Promise<ProviderLedgerEntry[]> {
    return db.providerLedgerEntry.findMany({
      where: buildListWhere(filter),
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: filter.limit,
      ...(filter.skip !== undefined && { skip: filter.skip }),
    });
  }

  /** Total rows matching the same filter, ignoring pagination. */
  count(db: Prisma.TransactionClient, filter: ListLedgerEntriesFilter): Promise<number> {
    return db.providerLedgerEntry.count({ where: buildListWhere(filter) });
  }
}

/**
 * Shared so `list` and `count` can never drift apart — a count computed over a
 * different filter than the page would report a wrong total page count.
 * The cursor predicate is excluded in offset mode, where `skip` positions instead.
 */
function buildListWhere(filter: ListLedgerEntriesFilter): Prisma.ProviderLedgerEntryWhereInput {
  return {
    ...(filter.providerType ? { provider_type: filter.providerType } : {}),
    ...(filter.providerId ? { provider_id: filter.providerId } : {}),
    ...(filter.entryType ? { entry_type: filter.entryType } : {}),
    ...(filter.skip === undefined && filter.cursor
      ? {
          OR: [
            { created_at: { lt: filter.cursor.createdAt } },
            { created_at: filter.cursor.createdAt, id: { lt: filter.cursor.id } },
          ],
        }
      : {}),
  };
}
