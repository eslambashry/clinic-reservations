import { Injectable } from '@nestjs/common';
import { Address, Laboratory, LabBranch, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export type LabBranchWithRelations = LabBranch & { laboratory: Laboratory; address: Address };

export interface CreateLabBranchInput {
  laboratoryId: string;
  addressId: string;
  phone: string;
  ianaTimezone: string;
  homeCollectionCapable?: boolean;
}

export interface UpdateLabBranchInput {
  phone?: string;
  ianaTimezone?: string;
  homeCollectionCapable?: boolean;
}

/**
 * `laboratory` owns `lab_branches` (File 12 Part 05), so `CreateLabOrderUseCase`
 * reads it directly rather than reaching into `provider-directory` for a
 * capability this module already has. The admin directory CRUD/verification
 * writes below mirror `provider-directory`'s `PharmacyBranchRepository`
 * one-for-one but live here for that same ownership reason — branches are
 * no longer seed-only.
 */
@Injectable()
export class LabBranchRepository {
  findById(db: Prisma.TransactionClient, id: string): Promise<LabBranch | null> {
    return db.labBranch.findUnique({ where: { id } });
  }

  /** Backs `GetLabBranchUseCase` (File 12 Part 48) — a staff member's own branch, display info only. */
  findByIdWithRelations(db: Prisma.TransactionClient, id: string): Promise<LabBranchWithRelations | null> {
    return db.labBranch.findUnique({ where: { id }, include: { laboratory: true, address: true } });
  }

  /** Backs the admin staff surface's "which branch does this account attach to" resolution. */
  findByLaboratoryId(db: Prisma.TransactionClient, laboratoryId: string): Promise<LabBranch[]> {
    return db.labBranch.findMany({
      where: { laboratory_id: laboratoryId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
  }

  create(db: Prisma.TransactionClient, input: CreateLabBranchInput): Promise<LabBranch> {
    return db.labBranch.create({
      data: {
        laboratory_id: input.laboratoryId,
        address_id: input.addressId,
        phone: input.phone,
        iana_timezone: input.ianaTimezone,
        home_collection_capable: input.homeCollectionCapable ?? false,
        // Admin creates the branch itself, so there is nobody left to verify it
        // against — see the identical note in `clinic-branch.repository.ts`.
        status: 'VERIFIED',
      },
    });
  }

  async update(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    input: UpdateLabBranchInput,
  ): Promise<void> {
    await updateWithOptimisticLock(db.labBranch, id, currentVersion, {
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.ianaTimezone !== undefined && { iana_timezone: input.ianaTimezone }),
      ...(input.homeCollectionCapable !== undefined && { home_collection_capable: input.homeCollectionCapable }),
    });
  }

  async setStatus(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    status: 'VERIFIED' | 'SUSPENDED',
  ): Promise<void> {
    await updateWithOptimisticLock(db.labBranch, id, currentVersion, { status });
  }
}
