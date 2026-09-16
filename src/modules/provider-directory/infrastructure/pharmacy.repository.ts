import { Injectable } from '@nestjs/common';
import { Pharmacy, Prisma, ProviderStatus } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface ListPharmaciesParams {
  status?: ProviderStatus;
  cursor?: { createdAt: string; id: string };
  limit: number;
  /** Offset mode (admin console only) — when set, the cursor branch is skipped. */
  skip?: number;
}

export interface CreatePharmacyInput {
  legalName: string;
  brandName: string;
  taxId?: string;
  regionCode?: string;
}

export interface UpdatePharmacyInput {
  legalName?: string;
  brandName?: string;
  taxId?: string;
  regionCode?: string;
}

const PHARMACY_WITH_BRANCHES = { branches: { include: { address: true } } } satisfies Prisma.PharmacyInclude;
export type PharmacyWithBranches = Prisma.PharmacyGetPayload<{ include: typeof PHARMACY_WITH_BRANCHES }>;

@Injectable()
export class PharmacyRepository {
  create(db: Prisma.TransactionClient, input: CreatePharmacyInput): Promise<Pharmacy> {
    return db.pharmacy.create({
      data: {
        legal_name: input.legalName,
        brand_name: input.brandName,
        tax_id: input.taxId,
        region_code: input.regionCode,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<Pharmacy | null> {
    return db.pharmacy.findUnique({ where: { id } });
  }

  findByIdWithBranches(db: Prisma.TransactionClient, id: string): Promise<PharmacyWithBranches | null> {
    return db.pharmacy.findUnique({ where: { id }, include: PHARMACY_WITH_BRANCHES });
  }

  async update(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    input: UpdatePharmacyInput,
  ): Promise<void> {
    await updateWithOptimisticLock(db.pharmacy, id, currentVersion, {
      ...(input.legalName !== undefined && { legal_name: input.legalName }),
      ...(input.brandName !== undefined && { brand_name: input.brandName }),
      ...(input.taxId !== undefined && { tax_id: input.taxId }),
      ...(input.regionCode !== undefined && { region_code: input.regionCode }),
    });
  }

  async setStatus(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    status: 'VERIFIED' | 'SUSPENDED',
  ): Promise<void> {
    await updateWithOptimisticLock(db.pharmacy, id, currentVersion, {
      status,
      ...(status === 'VERIFIED' && { verified_at: new Date() }),
    });
  }

  /** Admin review queue — cursor pagination on `(created_at, id)`, oldest-first, same shape as `DoctorRepository.list`. */
  list(db: Prisma.TransactionClient, params: ListPharmaciesParams): Promise<Pharmacy[]> {
    return db.pharmacy.findMany({
      where: buildListWhere(params),
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: params.limit,
      ...(params.skip !== undefined && { skip: params.skip }),
    });
  }

  /** Total rows matching the same filter, ignoring pagination. */
  count(db: Prisma.TransactionClient, params: Pick<ListPharmaciesParams, 'status'>): Promise<number> {
    return db.pharmacy.count({ where: buildListWhere(params) });
  }
}

/**
 * Shared so `list` and `count` can never drift apart — a count computed over a
 * different filter than the page would report a wrong total page count.
 * The cursor predicate is deliberately excluded in offset mode, where `skip`
 * does the positioning instead.
 */
function buildListWhere(params: Pick<ListPharmaciesParams, 'status' | 'cursor' | 'skip'>): Prisma.PharmacyWhereInput {
  return {
    deleted_at: null,
    ...(params.status && { status: params.status }),
    ...(params.skip === undefined &&
      params.cursor && {
        OR: [
          { created_at: { gt: new Date(params.cursor.createdAt) } },
          { created_at: new Date(params.cursor.createdAt), id: { gt: params.cursor.id } },
        ],
      }),
  };
}
