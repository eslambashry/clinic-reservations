import { Injectable } from '@nestjs/common';
import { PharmacyBranch } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AddressInput, AddressRepository } from '../infrastructure/address.repository';
import { PharmacyRepository } from '../infrastructure/pharmacy.repository';
import { PharmacyBranchRepository } from '../infrastructure/pharmacy-branch.repository';

export interface CreatePharmacyBranchInput {
  address: AddressInput;
  phone: string;
  ianaTimezone: string;
  deliveryCapable?: boolean;
}

@Injectable()
export class CreatePharmacyBranchUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pharmacies: PharmacyRepository,
    private readonly branches: PharmacyBranchRepository,
    private readonly addresses: AddressRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(
    pharmacyId: string,
    input: CreatePharmacyBranchInput,
    actor: AccessTokenPayload,
  ): Promise<PharmacyBranch> {
    return this.prisma.$transaction(async (tx) => {
      const pharmacy = await this.pharmacies.findById(tx, pharmacyId);
      if (!pharmacy) {
        throw new NotFoundError('Pharmacy', pharmacyId);
      }

      const address = await this.addresses.create(tx, input.address);
      const branch = await this.branches.create(tx, {
        pharmacyId,
        addressId: address.id,
        phone: input.phone,
        ianaTimezone: input.ianaTimezone,
        deliveryCapable: input.deliveryCapable,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.pharmacy_branch.create',
        resourceType: 'pharmacy_branch',
        resourceId: branch.id,
      });

      return branch;
    });
  }
}
