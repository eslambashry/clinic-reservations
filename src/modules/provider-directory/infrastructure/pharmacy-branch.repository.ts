import { Injectable } from '@nestjs/common';
import { PharmacyBranch, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface CreatePharmacyBranchInput {
  pharmacyId: string;
  addressId: string;
  phone: string;
  ianaTimezone: string;
  deliveryCapable?: boolean;
}

export interface UpdatePharmacyBranchInput {
  phone?: string;
  ianaTimezone?: string;
  deliveryCapable?: boolean;
}

const BRANCH_WITH_RELATIONS = { address: true, pharmacy: true } satisfies Prisma.PharmacyBranchInclude;
export type PharmacyBranchWithRelations = Prisma.PharmacyBranchGetPayload<{ include: typeof BRANCH_WITH_RELATIONS }>;

@Injectable()
export class PharmacyBranchRepository {
  create(db: Prisma.TransactionClient, input: CreatePharmacyBranchInput): Promise<PharmacyBranch> {
    return db.pharmacyBranch.create({
      data: {
        pharmacy_id: input.pharmacyId,
        address_id: input.addressId,
        phone: input.phone,
        iana_timezone: input.ianaTimezone,
        delivery_capable: input.deliveryCapable ?? false,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<PharmacyBranch | null> {
    return db.pharmacyBranch.findUnique({ where: { id } });
  }

  findByIdWithRelations(db: Prisma.TransactionClient, id: string): Promise<PharmacyBranchWithRelations | null> {
    return db.pharmacyBranch.findUnique({ where: { id }, include: BRANCH_WITH_RELATIONS });
  }

  async update(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    input: UpdatePharmacyBranchInput,
  ): Promise<void> {
    await updateWithOptimisticLock(db.pharmacyBranch, id, currentVersion, {
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.ianaTimezone !== undefined && { iana_timezone: input.ianaTimezone }),
      ...(input.deliveryCapable !== undefined && { delivery_capable: input.deliveryCapable }),
    });
  }

  async setStatus(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    status: 'VERIFIED' | 'SUSPENDED',
  ): Promise<void> {
    await updateWithOptimisticLock(db.pharmacyBranch, id, currentVersion, { status });
  }
}
