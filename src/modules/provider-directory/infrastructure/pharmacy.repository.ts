import { Injectable } from '@nestjs/common';
import { Pharmacy, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

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
}
