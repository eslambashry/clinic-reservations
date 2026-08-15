import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyBranchRepository } from '../infrastructure/pharmacy-branch.repository';

@Injectable()
export class SuspendPharmacyBranchUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyBranchRepository) private readonly branches: PharmacyBranchRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(branchId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const branch = await this.branches.findById(tx, branchId);
      if (!branch) {
        throw new NotFoundError('PharmacyBranch', branchId);
      }

      await this.branches.setStatus(tx, branchId, branch.version, 'SUSPENDED');

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.pharmacy_branch.suspend',
        resourceType: 'pharmacy_branch',
        resourceId: branchId,
        reasonCode: `previous_status:${branch.status}`,
      });
    });
  }
}
