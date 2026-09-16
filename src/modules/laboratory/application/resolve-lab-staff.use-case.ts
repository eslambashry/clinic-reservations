import { Inject, Injectable } from '@nestjs/common';
import { Prisma, RoleContextType } from '@prisma/client';
import { ListStaffByContextUseCase, StaffMember } from '../../identity-auth/application/list-staff-by-context.use-case';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { LabBranchRepository } from '../infrastructure/lab-branch.repository';
import { LaboratoryRepository } from '../infrastructure/laboratory.repository';

export const LAB_STAFF_ROLE_CODE = 'LAB_STAFF';

export interface ResolvedLabStaff {
  staff: StaffMember;
  labBranchId: string;
}

/**
 * `LAB_STAFF` memberships are keyed on the `LabBranch` id, never the
 * laboratory, so every laboratory-scoped staff operation has to fan out over
 * the laboratory's branches to find its one account. Centralised here so
 * create (one-per-laboratory conflict check), read, update and delete all
 * agree on what "this laboratory's staff account" means.
 */
@Injectable()
export class ResolveLabStaffUseCase {
  constructor(
    @Inject(LaboratoryRepository) private readonly laboratories: LaboratoryRepository,
    @Inject(LabBranchRepository) private readonly branches: LabBranchRepository,
    @Inject(ListStaffByContextUseCase) private readonly listStaff: ListStaffByContextUseCase,
  ) {}

  /** 404s a missing or soft-deleted laboratory before any staff work happens. */
  async requireLaboratoryBranches(db: Prisma.TransactionClient, laboratoryId: string) {
    const laboratory = await this.laboratories.findById(db, laboratoryId);
    if (!laboratory || laboratory.deleted_at) {
      throw new NotFoundError('Laboratory', laboratoryId);
    }
    return this.branches.findByLaboratoryId(db, laboratoryId);
  }

  async findActive(db: Prisma.TransactionClient, laboratoryId: string): Promise<ResolvedLabStaff | null> {
    const branches = await this.requireLaboratoryBranches(db, laboratoryId);

    for (const branch of branches) {
      // `listByContext` already filters to ACTIVE memberships, so any hit
      // here is by definition the laboratory's live account.
      const [active] = await this.listStaff.execute(
        {
          roleCode: LAB_STAFF_ROLE_CODE,
          contextType: RoleContextType.LAB_STAFF,
          contextId: branch.id,
        },
        db,
      );
      if (active) {
        return { staff: active, labBranchId: branch.id };
      }
    }

    return null;
  }
}
