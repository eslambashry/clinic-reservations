import { Injectable } from '@nestjs/common';
import { Address, Laboratory, LabBranch, Prisma } from '@prisma/client';

export type LabBranchWithRelations = LabBranch & { laboratory: Laboratory; address: Address };

/**
 * Minimal read-only lookup — `laboratory` owns `lab_branches` (File 12 Part
 * 05), so `CreateLabOrderUseCase` reads it directly rather than reaching
 * into `provider-directory` for a capability this module already has. Full
 * directory CRUD/verification (mirroring `provider-directory`'s pharmacy
 * equivalent) is out of scope for this pass — branches are seeded, not
 * managed through an API yet.
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
}
