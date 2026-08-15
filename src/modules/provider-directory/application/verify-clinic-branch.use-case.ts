import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ClinicBranchRepository } from '../infrastructure/clinic-branch.repository';

/** File 12 Part 32.2: branch verification is a direct Admin toggle, no document/outbox coupling. */
@Injectable()
export class VerifyClinicBranchUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClinicBranchRepository) private readonly branches: ClinicBranchRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(branchId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const branch = await this.branches.findById(tx, branchId);
      if (!branch) {
        throw new NotFoundError('ClinicBranch', branchId);
      }

      await this.branches.setStatus(tx, branchId, branch.version, 'VERIFIED');

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.clinic_branch.verify',
        resourceType: 'clinic_branch',
        resourceId: branchId,
        reasonCode: `previous_status:${branch.status}`,
      });
    });
  }
}
