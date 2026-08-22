import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AddressInput, AddressRepository } from '../infrastructure/address.repository';
import { ClinicBranchRepository, UpdateClinicBranchInput } from '../infrastructure/clinic-branch.repository';

export interface UpdateClinicBranchUseCaseInput extends UpdateClinicBranchInput {
  address?: Partial<AddressInput>;
}

@Injectable()
export class UpdateClinicBranchUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClinicBranchRepository) private readonly branches: ClinicBranchRepository,
    @Inject(AddressRepository) private readonly addresses: AddressRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(branchId: string, input: UpdateClinicBranchUseCaseInput, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const branch = await this.branches.findByIdWithRelations(tx, branchId);
      if (!branch) {
        throw new NotFoundError('ClinicBranch', branchId);
      }

      await this.branches.update(tx, branchId, branch.version, input);
      if (input.address) {
        await this.addresses.update(tx, branch.address_id, branch.address.version, input.address);
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.clinic_branch.update',
        resourceType: 'clinic_branch',
        resourceId: branchId,
      });
    });
  }
}
