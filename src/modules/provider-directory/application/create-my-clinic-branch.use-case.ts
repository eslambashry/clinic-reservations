import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AddressRepository } from '../infrastructure/address.repository';
import { AffiliationRepository } from '../infrastructure/affiliation.repository';
import { ClinicBranchRepository } from '../infrastructure/clinic-branch.repository';
import { ListMyDoctorClinicsUseCase, MyDoctorClinic } from './list-my-doctor-clinics.use-case';
import { ResolveDoctorScopeUseCase } from './resolve-doctor-scope.use-case';

export interface CreateMyClinicBranchInput {
  clinicId: string;
  phone: string;
  ianaTimezone: string;
  address: { line1: string; city: string; regionCode: string; countryCode: string; geoLat?: number; geoLng?: number };
  consultFee: number;
  currency: string;
}

@Injectable()
export class CreateMyClinicBranchUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(AddressRepository) private readonly addresses: AddressRepository,
    @Inject(ClinicBranchRepository) private readonly branches: ClinicBranchRepository,
    @Inject(AffiliationRepository) private readonly affiliations: AffiliationRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ListMyDoctorClinicsUseCase) private readonly listMyClinics: ListMyDoctorClinicsUseCase,
  ) {}

  async execute(input: CreateMyClinicBranchInput, actor: AccessTokenPayload): Promise<MyDoctorClinic> {
    const scope = await this.doctorScope.execute(actor);
    if (!scope.affiliations.some((item) => item.clinicId === input.clinicId)) {
      throw new NotFoundError('Clinic', input.clinicId);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const address = await this.addresses.create(tx, input.address);
      const branch = await this.branches.create(tx, {
        clinicId: input.clinicId,
        addressId: address.id,
        phone: input.phone,
        ianaTimezone: input.ianaTimezone,
      });
      const affiliation = await this.affiliations.create(tx, {
        doctorId: scope.doctorId,
        clinicBranchId: branch.id,
        consultFee: input.consultFee.toFixed(2),
        currency: input.currency,
      });
      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.doctor.branch.create',
        resourceType: 'clinic_branch',
        resourceId: branch.id,
      });
      return affiliation.id;
    });

    const refreshed = await this.listMyClinics.execute(actor);
    const created = refreshed.items.find((item) => item.affiliationId === result);
    if (!created) throw new NotFoundError('DoctorClinicAffiliation', result);
    return created;
  }
}
