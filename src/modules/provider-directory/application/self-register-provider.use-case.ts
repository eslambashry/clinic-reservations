import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { PROVIDER_REGISTRATION_CONSTANTS } from '../../../shared/config/constants';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AddressRepository } from '../infrastructure/address.repository';
import { AffiliationRepository } from '../infrastructure/affiliation.repository';
import { ClinicRepository } from '../infrastructure/clinic.repository';
import { ClinicBranchRepository } from '../infrastructure/clinic-branch.repository';
import { DoctorRepository } from '../infrastructure/doctor.repository';
import { SpecialtyRepository } from '../infrastructure/specialty.repository';
import { SubmitProviderRegistrationDto } from '../api/dto/submit-provider-registration.dto';
import { translateCreateDoctorError } from './create-doctor.use-case';

/**
 * ADR-005 (`docs/decisions/ADR-005-PROVIDER-SELF-REGISTRATION.md`, FILE_12
 * Part 34): the same `Clinic`/`Address`/`ClinicBranch`/`Doctor`/
 * `DoctorClinicAffiliation` rows an Admin would create via the individual
 * Admin-only endpoints (`ClinicsController`/`DoctorsController`/etc.), all
 * starting in their existing `PENDING` default status — this is an
 * additional *authenticated intake channel*, not a new trust level. Nothing
 * here grants a role membership or bypasses the Admin `verify` step.
 */
export interface SelfRegisterProviderResult {
  doctorId: string;
  clinicId: string;
  clinicBranchId: string;
  affiliationId: string;
  status: string;
  notPersisted: string[];
}

/** ADR-005: fields the frontend already sends that have no persisted destination yet — echoed back, never silently dropped. */
export const SELF_REGISTRATION_NOT_PERSISTED_FIELDS = [
  'full_name',
  'specialty_label',
  'degree',
  'email',
  'photo_data_uri',
  'experience_years',
  'bio',
  'documents',
  'city_label',
  'working_days',
] as const;

@Injectable()
export class SelfRegisterProviderUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly specialties: SpecialtyRepository,
    private readonly clinics: ClinicRepository,
    private readonly addresses: AddressRepository,
    private readonly branches: ClinicBranchRepository,
    private readonly doctors: DoctorRepository,
    private readonly affiliations: AffiliationRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(dto: SubmitProviderRegistrationDto, actor: AccessTokenPayload): Promise<SelfRegisterProviderResult> {
    return this.prisma.$transaction(async (tx) => {
      const specialty = await this.specialties.findByCode(tx, dto.specialty);
      if (!specialty) {
        throw new NotFoundError('Specialty', dto.specialty);
      }

      const clinic = await this.clinics.create(tx, {
        legalName: dto.clinic_name,
        brandName: dto.clinic_name,
      });

      const address = await this.addresses.create(tx, {
        line1: dto.clinic_address,
        city: dto.city,
        regionCode: dto.region_code,
        countryCode: PROVIDER_REGISTRATION_CONSTANTS.DEFAULT_COUNTRY_CODE,
      });

      const branch = await this.branches.create(tx, {
        clinicId: clinic.id,
        addressId: address.id,
        phone: dto.phone,
        ianaTimezone: PROVIDER_REGISTRATION_CONSTANTS.DEFAULT_IANA_TIMEZONE,
      });

      // Never trust a client-supplied user id — the applicant is always the caller (ADR-005).
      let doctor;
      try {
        doctor = await this.doctors.create(tx, {
          userId: actor.sub,
          specialtyCode: dto.specialty,
          licenseNumber: dto.license_number,
          regionCode: dto.region_code,
        });
      } catch (error) {
        throw translateCreateDoctorError(error, actor.sub);
      }

      const affiliation = await this.affiliations.create(tx, {
        doctorId: doctor.id,
        clinicBranchId: branch.id,
        consultFee: dto.consultation_fee.toString(),
        currency: PROVIDER_REGISTRATION_CONSTANTS.DEFAULT_CURRENCY,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.self_registration.submit',
        resourceType: 'doctor',
        resourceId: doctor.id,
      });

      return {
        doctorId: doctor.id,
        clinicId: clinic.id,
        clinicBranchId: branch.id,
        affiliationId: affiliation.id,
        status: doctor.status,
        notPersisted: [...SELF_REGISTRATION_NOT_PERSISTED_FIELDS],
      };
    });
  }
}
