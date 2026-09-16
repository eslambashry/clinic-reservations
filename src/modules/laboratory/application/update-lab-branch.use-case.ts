import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { ManageAddressUseCase } from '../../provider-directory/application/manage-address.use-case';
import { AddressInput } from '../../provider-directory/infrastructure/address.repository';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { LabBranchRepository, UpdateLabBranchInput } from '../infrastructure/lab-branch.repository';

export interface UpdateLabBranchUseCaseInput extends UpdateLabBranchInput {
  address?: Partial<AddressInput>;
}

@Injectable()
export class UpdateLabBranchUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabBranchRepository) private readonly branches: LabBranchRepository,
    @Inject(ManageAddressUseCase) private readonly addresses: ManageAddressUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(branchId: string, input: UpdateLabBranchUseCaseInput, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const branch = await this.branches.findByIdWithRelations(tx, branchId);
      if (!branch) {
        throw new NotFoundError('LabBranch', branchId);
      }

      await this.branches.update(tx, branchId, branch.version, input);
      if (input.address) {
        await this.addresses.update(tx, branch.address_id, branch.address.version, input.address);
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'laboratory.lab_branch.update',
        resourceType: 'lab_branch',
        resourceId: branchId,
      });
    });
  }
}
