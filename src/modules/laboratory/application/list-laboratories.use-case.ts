import { Inject, Injectable } from '@nestjs/common';
import { Laboratory, ProviderStatus } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { OffsetPageMeta, buildPageMeta, isOffsetMode, resolveOffset } from '../../../shared/core/pagination/offset.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { LaboratoryRepository } from '../infrastructure/laboratory.repository';

export interface ListLaboratoriesInput {
  status?: ProviderStatus;
  cursor?: string;
  limit?: number;
  /** Admin console offset mode — takes precedence over cursor when present. */
  page?: number;
}

export interface LaboratoryListItem {
  id: string;
  legalName: string;
  brandName: string;
  taxId: string | null;
  regionCode: string | null;
  status: ProviderStatus;
  verifiedAt: string | null;
  createdAt: string;
}

export interface ListLaboratoriesResult extends OffsetPageMeta {
  items: LaboratoryListItem[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface LaboratoryListCursor {
  c: string;
  i: string;
}

/**
 * Admin review queue, mirroring `ListDoctorsUseCase` exactly — oldest-first
 * on `(created_at, id)`, every status unless filtered. The public
 * `GET /lab-branches/search` path only ever surfaces VERIFIED branches, so
 * an admin has no other way to see a PENDING laboratory at all.
 */
@Injectable()
export class ListLaboratoriesUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LaboratoryRepository) private readonly laboratories: LaboratoryRepository,
  ) {}

  async execute(input: ListLaboratoriesInput): Promise<ListLaboratoriesResult> {
    const offset = resolveOffset({ page: input.page, limit: input.limit });

    if (isOffsetMode(input)) {
      const [rows, totalCount] = await Promise.all([
        this.laboratories.list(this.prisma, { status: input.status, limit: offset.take, skip: offset.skip }),
        this.laboratories.count(this.prisma, { status: input.status }),
      ]);

      return {
        items: rows.map(toListItem),
        nextCursor: null,
        ...buildPageMeta(totalCount, offset.page, offset.limit),
      };
    }

    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = decodeCursor<LaboratoryListCursor>(input.cursor);

    const [rows, totalCount] = await Promise.all([
      this.laboratories.list(this.prisma, {
        status: input.status,
        cursor: cursor ? { createdAt: cursor.c, id: cursor.i } : undefined,
        limit: limit + 1,
      }),
      this.laboratories.count(this.prisma, { status: input.status }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(toListItem),
      nextCursor:
        hasMore && last ? encodeCursor<LaboratoryListCursor>({ c: last.created_at.toISOString(), i: last.id }) : null,
      ...buildPageMeta(totalCount, 1, limit),
    };
  }
}

function toListItem(row: Laboratory): LaboratoryListItem {
  return {
    id: row.id,
    legalName: row.legal_name,
    brandName: row.brand_name,
    taxId: row.tax_id,
    regionCode: row.region_code,
    status: row.status,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
