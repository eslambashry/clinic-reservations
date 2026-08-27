import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { canBypassVisibility, isProviderEntityVisible } from '../domain/provider-visibility.rules';
import { AffiliationRepository, AffiliationWithBranch } from '../infrastructure/affiliation.repository';
import { DoctorRepository } from '../infrastructure/doctor.repository';

export interface DoctorAffiliationSummary {
  clinicBranchId: string;
  clinicName: string;
  consultationFee: string;
  currency: string;
  ianaTimezone: string;
}

/**
 * Flat, camelCase shape for `GET /v1/doctors/{id}` — only fields that
 * actually exist in the schema. `bio`/`degree`/`experienceYears` were added
 * by ADR-005 Part 34.2 (previously null-only placeholders here); no
 * qualifications/fellowships/languages/isOnline columns exist yet.
 * `availableDays` comes from the separate `/slots` endpoint, not here.
 */
export interface DoctorDetail {
  id: string;
  name: string;
  specialty: string;
  specialtyKey: string;
  rating: number;
  reviewCount: number;
  photoUrl: string | null;
  isVerified: boolean;
  bio: string | null;
  degree: string | null;
  experienceYears: number | null;
  clinicBranchId: string | null;
  clinicName: string | null;
  consultationFee: string | null;
  currency: string | null;
  ianaTimezone: string | null;
  affiliations: DoctorAffiliationSummary[];
}

/**
 * File 12 Part 32.2/9: anonymous/non-Admin callers only ever see a
 * `VERIFIED` doctor (404 otherwise — never reveal existence, File 11 07.2)
 * and only `ACTIVE` affiliations at `VERIFIED` branches/clinics; an
 * `@OptionalAuth()` Admin caller bypasses both filters to review a pending
 * provider.
 */
@Injectable()
export class GetDoctorUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(AffiliationRepository) private readonly affiliations: AffiliationRepository,
  ) {}

  async execute(doctorId: string, callerContextType: string | undefined): Promise<DoctorDetail> {
    const isAdmin = canBypassVisibility(callerContextType);

    const doctor = await this.doctors.findByIdWithUser(this.prisma, doctorId);
    if (!doctor || (!isAdmin && !isProviderEntityVisible({ status: doctor.status, deletedAt: doctor.deleted_at }))) {
      throw new NotFoundError('Doctor', doctorId);
    }

    const allAffiliations = await this.affiliations.findByDoctorId(this.prisma, doctorId, false);
    const visibleAffiliations = isAdmin
      ? allAffiliations
      : allAffiliations.filter(
          (a) => a.status === 'ACTIVE' && a.clinic_branch.status === 'VERIFIED' && a.clinic_branch.clinic.status === 'VERIFIED' && a.clinic_branch.clinic.deleted_at === null,
        );

    const affiliations = visibleAffiliations.map(toAffiliationSummary);
    const primary = affiliations[0] ?? null;
    const name = [doctor.user.first_name, doctor.user.last_name].filter(Boolean).join(' ') || 'Unknown';

    return {
      id: doctor.id,
      name,
      specialty: doctor.specialty.name_en,
      specialtyKey: doctor.specialty.code,
      rating: Number(doctor.rating_avg),
      reviewCount: doctor.rating_count,
      photoUrl: doctor.photo_url,
      isVerified: doctor.status === 'VERIFIED',
      bio: doctor.bio,
      degree: doctor.degree,
      experienceYears: doctor.experience_years,
      clinicBranchId: primary?.clinicBranchId ?? null,
      clinicName: primary?.clinicName ?? null,
      consultationFee: primary?.consultationFee ?? null,
      currency: primary?.currency ?? null,
      ianaTimezone: primary?.ianaTimezone ?? null,
      affiliations,
    };
  }
}

function toAffiliationSummary(a: AffiliationWithBranch): DoctorAffiliationSummary {
  return {
    clinicBranchId: a.clinic_branch_id,
    clinicName: a.clinic_branch.clinic.brand_name,
    consultationFee: a.consult_fee.toString(),
    currency: a.currency,
    ianaTimezone: a.clinic_branch.iana_timezone,
  };
}
