import { Inject, Injectable } from '@nestjs/common';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { LabBranchRepository } from '../infrastructure/lab-branch.repository';

export interface LabBranchDetail {
  id: string;
  phone: string;
  laboratory: { brandName: string };
  address: { line1: string; city: string };
}

/**
 * `GET /lab-branches/{branchId}`, `LAB_STAFF` only (File 12 Part 48) — a
 * staff member's own branch, display info only. Not a public directory
 * lookup (unlike `GetPharmacyBranchUseCase`, which serves patient-facing
 * search/detail and therefore needs `provider-visibility.rules.ts`): no
 * caller here is ever anonymous, and nobody should see a branch other than
 * the one their own membership is scoped to, so the check is a plain
 * membership-match rather than a visibility/status computation. Full
 * directory CRUD (search, verify, suspend, self-service edit) mirroring
 * `provider-directory`'s pharmacy equivalent is out of scope — added only
 * because the real-auth bridge (this Part) needs branch display info to
 * show after login, exactly the same reason `pharmacy-branches/{id}`
 * exists on the pharmacy dashboard's own login flow.
 */
@Injectable()
export class GetLabBranchUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabBranchRepository) private readonly labBranches: LabBranchRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
  ) {}

  async execute(branchId: string, actor: AccessTokenPayload): Promise<LabBranchDetail> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || membership.contextId !== branchId) {
      throw new ForbiddenError('RESOURCE_NOT_OWNED', 'هذا الحساب غير مرتبط بفرع المعمل هذا.');
    }

    const branch = await this.labBranches.findByIdWithRelations(this.prisma, branchId);
    if (!branch) {
      throw new NotFoundError('LabBranch', branchId);
    }

    return {
      id: branch.id,
      phone: branch.phone,
      laboratory: { brandName: branch.laboratory.brand_name },
      address: { line1: branch.address.line1, city: branch.address.city },
    };
  }
}
