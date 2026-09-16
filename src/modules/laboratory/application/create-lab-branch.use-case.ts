import { Inject, Injectable } from '@nestjs/common';
import { LabBranch } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { ManageAddressUseCase } from '../../provider-directory/application/manage-address.use-case';
import { AddressInput } from '../../provider-directory/infrastructure/address.repository';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { LabBranchRepository } from '../infrastructure/lab-branch.repository';
import { LaboratoryRepository } from '../infrastructure/laboratory.repository';

export interface CreateLabBranchUseCaseInput {
  address: AddressInput;
  phone: string;
  ianaTimezone: string;
  homeCollectionCapable?: boolean;
}

/**
 * `addresses` is a `provider-directory`-owned table (File 12 Part 05), so the
 * address row is written through that module's `ManageAddressUseCase` with
 * this transaction rather than by reaching into its `infrastructure/`.
 */
@Injectable()
export class CreateLabBranchUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LaboratoryRepository) private readonly laboratories: LaboratoryRepository,
    @Inject(LabBranchRepository) private readonly branches: LabBranchRepository,
    @Inject(ManageAddressUseCase) private readonly addresses: ManageAddressUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(
    laboratoryId: string,
    input: CreateLabBranchUseCaseInput,
    actor: AccessTokenPayload,
  ): Promise<LabBranch> {
    return this.prisma.$transaction(async (tx) => {
      const laboratory = await this.laboratories.findById(tx, laboratoryId);
      if (!laboratory || laboratory.deleted_at) {
        throw new NotFoundError('Laboratory', laboratoryId);
      }

      const address = await this.addresses.create(tx, input.address);
      const branch = await this.branches.create(tx, {
        laboratoryId,
        addressId: address.id,
        phone: input.phone,
        ianaTimezone: input.ianaTimezone,
        homeCollectionCapable: input.homeCollectionCapable,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'laboratory.lab_branch.create',
        resourceType: 'lab_branch',
        resourceId: branch.id,
      });

      return branch;
    });
  }
}
