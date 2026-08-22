import { Inject, Injectable } from '@nestjs/common';
import { ClinicBranch } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AddressInput, AddressRepository } from '../infrastructure/address.repository';
import { ClinicRepository } from '../infrastructure/clinic.repository';
import { ClinicBranchRepository } from '../infrastructure/clinic-branch.repository';

export interface CreateClinicBranchInput {
  address: AddressInput;
  phone: string;
  ianaTimezone: string;
}

@Injectable()
export class CreateClinicBranchUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClinicRepository) private readonly clinics: ClinicRepository,
    @Inject(ClinicBranchRepository) private readonly branches: ClinicBranchRepository,
    @Inject(AddressRepository) private readonly addresses: AddressRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(clinicId: string, input: CreateClinicBranchInput, actor: AccessTokenPayload): Promise<ClinicBranch> {
    return this.prisma.$transaction(async (tx) => {
      const clinic = await this.clinics.findById(tx, clinicId);
      if (!clinic) {
        throw new NotFoundError('Clinic', clinicId);
      }

      const address = await this.addresses.create(tx, input.address);
      const branch = await this.branches.create(tx, {
        clinicId,
        addressId: address.id,
        phone: input.phone,
        ianaTimezone: input.ianaTimezone,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.clinic_branch.create',
        resourceType: 'clinic_branch',
        resourceId: branch.id,
      });

      return branch;
    });
  }
}
