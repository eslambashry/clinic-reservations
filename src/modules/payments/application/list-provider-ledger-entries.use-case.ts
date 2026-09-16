import { Inject, Injectable } from '@nestjs/common';
import { LedgerEntryType, ProviderType } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { OffsetPageMeta, buildPageMeta, isOffsetMode, resolveOffset } from '../../../shared/core/pagination/offset.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ProviderLedgerRepository } from '../infrastructure/provider-ledger.repository';

export interface ListProviderLedgerEntriesInput {
  providerType?: ProviderType;
  providerId?: string;
  entryType?: LedgerEntryType;
  cursor?: string;
  limit?: number;
  /** Admin console offset mode — takes precedence over cursor when present. */
  page?: number;
}

export interface ProviderLedgerEntrySummary {
  id: string;
  providerType: ProviderType;
  providerId: string;
  entryType: LedgerEntryType;
  /** Fixed 2-decimal string — see `FinanceSummary`; `toString()` would drop trailing zeros. */
  amount: string;
  createdAt: string;
}

export interface ListProviderLedgerEntriesResult extends OffsetPageMeta {
  entries: ProviderLedgerEntrySummary[];
  nextCursor: string | null;
}

interface LedgerCursor {
  c: string;
  i: string;
}

const DEFAULT_LIMIT = 50;

/** File 11 Part 13 `provider_ledger_entries` read side — ADMIN finance console. */
@Injectable()
export class ListProviderLedgerEntriesUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProviderLedgerRepository) private readonly ledger: ProviderLedgerRepository,
  ) {}

  async execute(input: ListProviderLedgerEntriesInput): Promise<ListProviderLedgerEntriesResult> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const cursor = decodeCursor<LedgerCursor>(input.cursor);
    const offset = resolveOffset({ page: input.page, limit: input.limit });

    const filter = {
      providerType: input.providerType,
      providerId: input.providerId,
      entryType: input.entryType,
    };

    const offsetMode = isOffsetMode(input);
    const [rows, totalCount] = await Promise.all([
      this.ledger.list(
        this.prisma,
        offsetMode
          ? { ...filter, limit: offset.take, skip: offset.skip }
          : { ...filter, cursor: cursor ? { createdAt: new Date(cursor.c), id: cursor.i } : undefined, limit },
      ),
      this.ledger.count(this.prisma, { ...filter, limit }),
    ]);

    const last = rows.at(-1);
    return {
      entries: rows.map((row) => ({
        id: row.id,
        providerType: row.provider_type,
        providerId: row.provider_id,
        entryType: row.entry_type,
        amount: row.amount.toFixed(2),
        createdAt: row.created_at.toISOString(),
      })),
      nextCursor:
        !offsetMode && rows.length === limit && last
          ? encodeCursor<LedgerCursor>({ c: last.created_at.toISOString(), i: last.id })
          : null,
      ...buildPageMeta(totalCount, offsetMode ? offset.page : 1, offsetMode ? offset.limit : limit),
    };
  }
}
