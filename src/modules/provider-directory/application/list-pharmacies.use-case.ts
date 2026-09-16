import { Inject, Injectable } from '@nestjs/common';
import { Pharmacy, ProviderStatus } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { OffsetPageMeta, buildPageMeta, isOffsetMode, resolveOffset } from '../../../shared/core/pagination/offset.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyRepository } from '../infrastructure/pharmacy.repository';

export interface ListPharmaciesInput {
  status?: ProviderStatus;
  cursor?: string;
  limit?: number;
  /** Admin console offset mode — takes precedence over `cursor` when present. */
  page?: number;
}

export interface PharmacyListItem {
  id: string;
  legalName: string;
  brandName: string;
  regionCode: string | null;
  status: ProviderStatus;
  verifiedAt: string | null;
  createdAt: string;
}

export interface ListPharmaciesResult extends OffsetPageMeta {
  items: PharmacyListItem[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface PharmacyListCursor {
  c: string;
  i: string;
}

/**
 * Admin pharmacy queue — the pharmacy sibling of `ListDoctorsUseCase`:
 * `PharmaciesController` only ever exposed single-record reads, so the Admin
 * surface had no way to enumerate the pharmacies it onboards. Oldest-first,
 * same convention as `ListDoctorsUseCase`'s review queue.
 */
@Injectable()
export class ListPharmaciesUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyRepository) private readonly pharmacies: PharmacyRepository,
  ) {}

  async execute(input: ListPharmaciesInput): Promise<ListPharmaciesResult> {
    const offset = resolveOffset({ page: input.page, limit: input.limit });

    if (isOffsetMode(input)) {
      const [rows, totalCount] = await Promise.all([
        this.pharmacies.list(this.prisma, { status: input.status, limit: offset.take, skip: offset.skip }),
        this.pharmacies.count(this.prisma, { status: input.status }),
      ]);

      return {
        items: rows.map(toListItem),
        nextCursor: null,
        ...buildPageMeta(totalCount, offset.page, offset.limit),
      };
    }

    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = decodeCursor<PharmacyListCursor>(input.cursor);

    const [rows, totalCount] = await Promise.all([
      this.pharmacies.list(this.prisma, {
        status: input.status,
        cursor: cursor ? { createdAt: cursor.c, id: cursor.i } : undefined,
        limit: limit + 1,
      }),
      this.pharmacies.count(this.prisma, { status: input.status }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(toListItem),
      nextCursor: hasMore && last ? encodeCursor<PharmacyListCursor>({ c: last.created_at.toISOString(), i: last.id }) : null,
      ...buildPageMeta(totalCount, 1, limit),
    };
  }
}

function toListItem(row: Pharmacy): PharmacyListItem {
  return {
    id: row.id,
    legalName: row.legal_name,
    brandName: row.brand_name,
    regionCode: row.region_code,
    status: row.status,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
