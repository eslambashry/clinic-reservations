import { Injectable } from '@nestjs/common';
import { Clinic, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface CreateClinicInput {
  legalName: string;
  brandName: string;
  taxId?: string;
  regionCode?: string;
}

export interface UpdateClinicInput {
  legalName?: string;
  brandName?: string;
  taxId?: string;
  regionCode?: string;
}

const CLINIC_WITH_BRANCHES = { branches: { include: { address: true } } } satisfies Prisma.ClinicInclude;
export type ClinicWithBranches = Prisma.ClinicGetPayload<{ include: typeof CLINIC_WITH_BRANCHES }>;

@Injectable()
export class ClinicRepository {
  create(db: Prisma.TransactionClient, input: CreateClinicInput): Promise<Clinic> {
    return db.clinic.create({
      data: {
        legal_name: input.legalName,
        brand_name: input.brandName,
        tax_id: input.taxId,
        region_code: input.regionCode,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<Clinic | null> {
    return db.clinic.findUnique({ where: { id } });
  }

  findByIdWithBranches(db: Prisma.TransactionClient, id: string): Promise<ClinicWithBranches | null> {
    return db.clinic.findUnique({ where: { id }, include: CLINIC_WITH_BRANCHES });
  }

  async update(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    input: UpdateClinicInput,
  ): Promise<void> {
    await updateWithOptimisticLock(db.clinic, id, currentVersion, {
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
    await updateWithOptimisticLock(db.clinic, id, currentVersion, {
      status,
      ...(status === 'VERIFIED' && { verified_at: new Date() }),
    });
  }
}
