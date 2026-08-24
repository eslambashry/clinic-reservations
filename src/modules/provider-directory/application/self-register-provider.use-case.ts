import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { UpdateUserProfileUseCase } from '../../identity-auth/application/update-user-profile.use-case';
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

/** `full_name` arrives as one free-text string; `User` splits it first/last (File 12 Part 32.1). First token is the first name, the rest (if any) is the last name. */
function splitFullName(fullName: string): { firstName: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const [firstName, ...rest] = parts;
  return { firstName, lastName: rest.length > 0 ? rest.join(' ') : undefined };
}

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

/**
 * ADR-005: fields the frontend already sends that still have no persisted
 * destination — echoed back, never silently dropped. `full_name`/`email`/
 * `degree`/`experience_years`/`bio` used to be here too until Part 34.2
 * added `Doctor.degree`/`bio`/`experience_years` and wired `full_name`/
 * `email` through `UpdateUserProfileUseCase` onto `User`.
 * `photo_data_uri`/`documents` stay here — persisting either needs a real
 * object-storage upload step that doesn't exist yet (same DEC-009 gap as
 * `ProviderVerificationDocument.file_url`). `specialty_label`/`city_label`
 * are display-only duplicates of `specialty`/`city` and were never meant to
 * be persisted. `working_days` stays here deliberately — Part 33.1 keeps
 * real `ScheduleTemplate` creation Admin-only, not part of self-registration.
 */
export const SELF_REGISTRATION_NOT_PERSISTED_FIELDS = [
  'specialty_label',
  'photo_data_uri',
  'documents',
  'city_label',
  'working_days',
] as const;

@Injectable()
export class SelfRegisterProviderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SpecialtyRepository) private readonly specialties: SpecialtyRepository,
    @Inject(ClinicRepository) private readonly clinics: ClinicRepository,
    @Inject(AddressRepository) private readonly addresses: AddressRepository,
    @Inject(ClinicBranchRepository) private readonly branches: ClinicBranchRepository,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(AffiliationRepository) private readonly affiliations: AffiliationRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(UpdateUserProfileUseCase) private readonly updateUserProfile: UpdateUserProfileUseCase,
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
          degree: dto.degree,
          bio: dto.bio,
          experienceYears: dto.experience_years,
        });
      } catch (error) {
        throw translateCreateDoctorError(error, actor.sub);
      }

      if (dto.full_name !== undefined || dto.email !== undefined) {
        const { firstName, lastName } = dto.full_name !== undefined ? splitFullName(dto.full_name) : { firstName: undefined, lastName: undefined };
        await this.updateUserProfile.execute(tx, {
          userId: actor.sub,
          firstName,
          lastName,
          email: dto.email,
        });
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
