import { Inject, Injectable, Optional } from '@nestjs/common';
import { AffiliationStatus, ProviderStatus } from '@prisma/client';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AffiliationRepository, AffiliationWithBranch } from '../infrastructure/affiliation.repository';
import { DoctorRepository } from '../infrastructure/doctor.repository';

/**
 * One affiliation of the calling doctor, flattened with the branch/clinic
 * fields the Doctor Dashboard renders. Legal clinic data (`legal_name`,
 * `tax_id`) is deliberately absent — see `ListMyDoctorClinicsUseCase`.
 */
export interface DoctorAffiliationScope {
  affiliationId: string;
  affiliationStatus: AffiliationStatus;
  consultFee: string;
  currency: string;
  clinicId: string;
  clinicName: string;
  clinicStatus: ProviderStatus;
  clinicBranchId: string;
  branchStatus: ProviderStatus;
  branchPhone: string;
  ianaTimezone: string;
  addressId: string;
  addressLine1: string;
  addressCity: string;
  addressRegionCode: string;
  addressCountryCode: string;
}

export interface DoctorScope {
  doctorId: string;
  affiliations: DoctorAffiliationScope[];
  /** Membership set every doctor-scoped ownership check is decided against. */
  affiliationIds: string[];
  clinicBranchIds: string[];
}

function toAffiliationScope(affiliation: AffiliationWithBranch): DoctorAffiliationScope {
  const branch = affiliation.clinic_branch;
  return {
    affiliationId: affiliation.id,
    affiliationStatus: affiliation.status,
    consultFee: affiliation.consult_fee.toFixed(2),
    currency: affiliation.currency,
    clinicId: branch.clinic.id,
    clinicName: branch.clinic.brand_name,
    clinicStatus: branch.clinic.status,
    clinicBranchId: branch.id,
    branchStatus: branch.status,
    branchPhone: branch.phone,
    ianaTimezone: branch.iana_timezone,
    addressId: branch.address.id,
    addressLine1: branch.address.line1,
    addressCity: branch.address.city,
    addressRegionCode: branch.address.region_code,
    addressCountryCode: branch.address.country_code,
  };
}

/**
 * File 12 Part 49 — **the** doctor-scoped ownership primitive. Part 33.1 and
 * Part 35.8/35.14 both deferred doctor self-service on the grounds that "no
 * branch/doctor-scoped authorization primitive exists anywhere in this
 * codebase"; this is that primitive, built once here (in the module that
 * owns `doctors`/`doctor_clinic_affiliations`) and exported, rather than
 * re-derived per endpoint.
 *
 * Ownership always resolves from the JWT's `sub` -> `Doctor.user_id`, never
 * from a client-supplied id: `RoleMembership.context_id` is null for DOCTOR
 * memberships (see the `@@unique` doc comment on that model), so the
 * `doctors` row is the only authority on which affiliations a caller owns.
 *
 * Callers must treat a non-member id as **not found**, never 403 — the same
 * existence-hiding convention `CreateHoldUseCase`/`RescheduleAppointmentUseCase`
 * already use for cross-tenant ids (Part 35.11).
 */
@Injectable()
export class ResolveDoctorScopeUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(AffiliationRepository) private readonly affiliations: AffiliationRepository,
    @Optional() @Inject(GetActiveRoleMembershipUseCase) private readonly memberships?: GetActiveRoleMembershipUseCase,
  ) {}

  async execute(actor: AccessTokenPayload): Promise<DoctorScope> {
    const ownerDoctorId =
      actor.contextType === 'CLINIC_STAFF'
        ? (await this.memberships?.executeByRoleMembershipId(actor.roleMembershipId, 'CLINIC_STAFF'))?.contextId
        : null;
    const doctor = ownerDoctorId
      ? await this.doctors.findById(this.prisma, ownerDoctorId)
      : await this.doctors.findByUserId(this.prisma, actor.sub);
    if (!doctor || doctor.deleted_at) {
      throw new NotFoundError('Doctor', actor.sub);
    }

    // `onlyActive: false` — a PAUSED affiliation is still owned by this
    // doctor and must stay readable/manageable (pausing is how a doctor
    // steps back from a branch; it is not a loss of ownership).
    const rows = await this.affiliations.findByDoctorId(this.prisma, doctor.id, false);
    const affiliations = rows.map(toAffiliationScope);

    return {
      doctorId: doctor.id,
      affiliations,
      affiliationIds: affiliations.map((affiliation) => affiliation.affiliationId),
      clinicBranchIds: affiliations.map((affiliation) => affiliation.clinicBranchId),
    };
  }
}
