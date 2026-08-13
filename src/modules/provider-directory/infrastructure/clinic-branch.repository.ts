import { Injectable } from '@nestjs/common';
import { ClinicBranch, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface CreateClinicBranchInput {
  clinicId: string;
  addressId: string;
  phone: string;
  ianaTimezone: string;
}

export interface UpdateClinicBranchInput {
  phone?: string;
  ianaTimezone?: string;
}

const BRANCH_WITH_RELATIONS = { address: true, clinic: true } satisfies Prisma.ClinicBranchInclude;
export type ClinicBranchWithRelations = Prisma.ClinicBranchGetPayload<{ include: typeof BRANCH_WITH_RELATIONS }>;

@Injectable()
export class ClinicBranchRepository {
  create(db: Prisma.TransactionClient, input: CreateClinicBranchInput): Promise<ClinicBranch> {
    return db.clinicBranch.create({
      data: {
        clinic_id: input.clinicId,
        address_id: input.addressId,
        phone: input.phone,
        iana_timezone: input.ianaTimezone,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<ClinicBranch | null> {
    return db.clinicBranch.findUnique({ where: { id } });
  }

  findByIdWithRelations(db: Prisma.TransactionClient, id: string): Promise<ClinicBranchWithRelations | null> {
    return db.clinicBranch.findUnique({ where: { id }, include: BRANCH_WITH_RELATIONS });
  }

  async update(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    input: UpdateClinicBranchInput,
  ): Promise<void> {
    await updateWithOptimisticLock(db.clinicBranch, id, currentVersion, {
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.ianaTimezone !== undefined && { iana_timezone: input.ianaTimezone }),
    });
  }

  async setStatus(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    status: 'VERIFIED' | 'SUSPENDED',
  ): Promise<void> {
    await updateWithOptimisticLock(db.clinicBranch, id, currentVersion, { status });
  }
}
