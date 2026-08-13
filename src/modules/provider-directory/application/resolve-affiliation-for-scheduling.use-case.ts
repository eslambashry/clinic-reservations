import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { canBypassVisibility, isDoctorVisibleViaAffiliation } from '../domain/provider-visibility.rules';
import { AffiliationRepository } from '../infrastructure/affiliation.repository';

export interface ScheduleableAffiliation {
  affiliationId: string;
  timezone: string;
}

/**
 * File 12 Part 33.3 — `scheduling-appointments`' only way to resolve a
 * `doctorId`+`clinicBranchId` pair (the `GET /v1/doctors/{id}/slots` query
 * shape) into an affiliation, reusing the exact visibility chain
 * `GetDoctorUseCase` already applies rather than a second copy of the rule.
 * Exported from `ProviderDirectoryModule` — the module's own doc comment
 * anticipated this call, but nothing was exported until now.
 */
@Injectable()
export class ResolveAffiliationForSchedulingUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly affiliations: AffiliationRepository,
  ) {}

  async execute(doctorId: string, clinicBranchId: string, callerContextType: string | undefined): Promise<ScheduleableAffiliation> {
    const affiliation = await this.affiliations.findByDoctorAndBranch(this.prisma, doctorId, clinicBranchId);

    const isAdmin = canBypassVisibility(callerContextType);
    const isVisible =
      affiliation !== null &&
      isDoctorVisibleViaAffiliation({
        doctor: { status: affiliation.doctor.status, deletedAt: affiliation.doctor.deleted_at },
        affiliation: { status: affiliation.status },
        branch: { status: affiliation.clinic_branch.status },
        clinic: { status: affiliation.clinic_branch.clinic.status, deletedAt: affiliation.clinic_branch.clinic.deleted_at },
      });

    if (!affiliation || (!isAdmin && !isVisible)) {
      throw new NotFoundError('Doctor', doctorId);
    }

    return { affiliationId: affiliation.id, timezone: affiliation.clinic_branch.iana_timezone };
  }
}
