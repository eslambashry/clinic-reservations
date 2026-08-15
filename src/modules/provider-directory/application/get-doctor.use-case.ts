import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { canBypassVisibility, isProviderEntityVisible } from '../domain/provider-visibility.rules';
import { AffiliationRepository } from '../infrastructure/affiliation.repository';
import { DoctorRepository, DoctorWithUser } from '../infrastructure/doctor.repository';

export interface DoctorDetail {
  doctor: DoctorWithUser;
  affiliations: Awaited<ReturnType<AffiliationRepository['findByDoctorId']>>;
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
    const affiliations = isAdmin
      ? allAffiliations
      : allAffiliations.filter(
          (a) => a.status === 'ACTIVE' && a.clinic_branch.status === 'VERIFIED' && a.clinic_branch.clinic.status === 'VERIFIED' && a.clinic_branch.clinic.deleted_at === null,
        );

    return { doctor, affiliations };
  }
}
