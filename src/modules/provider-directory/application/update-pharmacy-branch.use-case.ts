import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AddressInput, AddressRepository } from '../infrastructure/address.repository';
import { PharmacyBranchRepository, UpdatePharmacyBranchInput } from '../infrastructure/pharmacy-branch.repository';

export interface UpdatePharmacyBranchUseCaseInput extends UpdatePharmacyBranchInput {
  address?: Partial<AddressInput>;
}

@Injectable()
export class UpdatePharmacyBranchUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: PharmacyBranchRepository,
    private readonly addresses: AddressRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(branchId: string, input: UpdatePharmacyBranchUseCaseInput, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const branch = await this.branches.findByIdWithRelations(tx, branchId);
      if (!branch) {
        throw new NotFoundError('PharmacyBranch', branchId);
      }

      await this.branches.update(tx, branchId, branch.version, input);
      if (input.address) {
        await this.addresses.update(tx, branch.address_id, branch.address.version, input.address);
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.pharmacy_branch.update',
        resourceType: 'pharmacy_branch',
        resourceId: branchId,
      });
    });
  }
}
