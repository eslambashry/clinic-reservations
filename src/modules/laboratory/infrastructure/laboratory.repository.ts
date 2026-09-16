import { Injectable } from '@nestjs/common';
import { Laboratory, Prisma, ProviderStatus } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface CreateLaboratoryInput {
  legalName: string;
  brandName: string;
  taxId?: string;
  regionCode?: string;
}

export interface UpdateLaboratoryInput {
  legalName?: string;
  brandName?: string;
  taxId?: string;
  regionCode?: string;
}

export interface ListLaboratoriesParams {
  status?: ProviderStatus;
  cursor?: { createdAt: string; id: string };
  limit: number;
  /** Offset mode (admin console only) — when set, the cursor branch is skipped. */
  skip?: number;
}

const LABORATORY_WITH_BRANCHES = { branches: { include: { address: true } } } satisfies Prisma.LaboratoryInclude;
export type LaboratoryWithBranches = Prisma.LaboratoryGetPayload<{ include: typeof LABORATORY_WITH_BRANCHES }>;

/**
 * Directory-side counterpart of `provider-directory`'s `PharmacyRepository`,
 * kept in this module because `laboratories` is a `laboratory`-owned table
 * (File 12 Part 05) — `provider-directory` may never read it directly.
 */
@Injectable()
export class LaboratoryRepository {
  create(db: Prisma.TransactionClient, input: CreateLaboratoryInput): Promise<Laboratory> {
    return db.laboratory.create({
      data: {
        legal_name: input.legalName,
        brand_name: input.brandName,
        tax_id: input.taxId,
        region_code: input.regionCode,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<Laboratory | null> {
    return db.laboratory.findUnique({ where: { id } });
  }

  findByIdWithBranches(db: Prisma.TransactionClient, id: string): Promise<LaboratoryWithBranches | null> {
    return db.laboratory.findUnique({ where: { id }, include: LABORATORY_WITH_BRANCHES });
  }

  /** Admin review queue — cursor pagination on `(created_at, id)`, oldest-first, same shape as `DoctorRepository.list`. */
  list(db: Prisma.TransactionClient, params: ListLaboratoriesParams): Promise<Laboratory[]> {
    return db.laboratory.findMany({
      where: buildListWhere(params),
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: params.limit,
      ...(params.skip !== undefined && { skip: params.skip }),
    });
  }

  /** Total rows matching the same filter, ignoring pagination. */
  count(db: Prisma.TransactionClient, params: Pick<ListLaboratoriesParams, 'status'>): Promise<number> {
    return db.laboratory.count({ where: buildListWhere(params) });
  }

  async update(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    input: UpdateLaboratoryInput,
  ): Promise<void> {
    await updateWithOptimisticLock(db.laboratory, id, currentVersion, {
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
    await updateWithOptimisticLock(db.laboratory, id, currentVersion, {
      status,
      ...(status === 'VERIFIED' && { verified_at: new Date() }),
    });
  }
}

/**
 * Shared so `list` and `count` can never drift apart — a count computed over a
 * different filter than the page would report a wrong total page count.
 */
function buildListWhere(params: Pick<ListLaboratoriesParams, 'status' | 'cursor' | 'skip'>): Prisma.LaboratoryWhereInput {
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
