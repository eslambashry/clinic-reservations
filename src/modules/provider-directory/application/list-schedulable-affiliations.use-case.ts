import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { isDoctorVisibleViaAffiliation } from '../domain/provider-visibility.rules';
import { AffiliationRepository } from '../infrastructure/affiliation.repository';
import { ScheduleableAffiliation } from './resolve-affiliation-for-scheduling.use-case';

/**
 * File 12 Part 33.3 — batch visibility filter for the slot-generation job:
 * given every affiliation that owns at least one `ScheduleTemplate`, returns
 * only the subset currently passing the Part 32 visibility chain, each with
 * its branch's `iana_timezone` (needed to convert the template's local
 * `"HH:mm"` into UTC). A `PENDING`/`SUSPENDED` provider's affiliations are
 * silently skipped here, not an error — the job simply doesn't generate
 * slots for them yet.
 */
@Injectable()
export class ListSchedulableAffiliationsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly affiliations: AffiliationRepository,
  ) {}

  async execute(affiliationIds: string[]): Promise<ScheduleableAffiliation[]> {
    if (affiliationIds.length === 0) {
      return [];
    }

    const rows = await this.affiliations.findManyByIdsWithVisibilityChain(this.prisma, affiliationIds);

    return rows
      .filter((affiliation) =>
        isDoctorVisibleViaAffiliation({
          doctor: { status: affiliation.doctor.status, deletedAt: affiliation.doctor.deleted_at },
          affiliation: { status: affiliation.status },
          branch: { status: affiliation.clinic_branch.status },
          clinic: { status: affiliation.clinic_branch.clinic.status, deletedAt: affiliation.clinic_branch.clinic.deleted_at },
        }),
      )
      .map((affiliation) => ({ affiliationId: affiliation.id, timezone: affiliation.clinic_branch.iana_timezone }));
  }
}
