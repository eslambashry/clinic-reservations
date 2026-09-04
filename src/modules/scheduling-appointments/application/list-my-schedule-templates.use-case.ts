import { Inject, Injectable } from '@nestjs/common';
import { DoctorAffiliationScope, ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ScheduleTemplateRepository } from '../infrastructure/schedule-template.repository';
import { MyScheduleTemplate, toMyScheduleTemplate } from './doctor-schedule-template.mapper';

export interface ListMyScheduleTemplatesInput {
  /** Optional narrowing filter. Must be one of the caller's own affiliations — it never widens the scope. */
  affiliationId?: string;
}

export interface ListMyScheduleTemplatesResult {
  items: MyScheduleTemplate[];
}

/**
 * `GET /v1/doctors/me/schedule-templates` (File 12 Part 49.5).
 *
 * Defaults to every affiliation the caller owns, so a doctor working at two
 * branches sees one combined weekly plan. `affiliationId` only ever narrows
 * that set — an id outside the caller's scope is a 404, never a widened read.
 */
@Injectable()
export class ListMyScheduleTemplatesUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(ScheduleTemplateRepository) private readonly scheduleTemplates: ScheduleTemplateRepository,
  ) {}

  async execute(input: ListMyScheduleTemplatesInput, actor: AccessTokenPayload): Promise<ListMyScheduleTemplatesResult> {
    const scope = await this.doctorScope.execute(actor);

    let affiliations: DoctorAffiliationScope[] = scope.affiliations;
    if (input.affiliationId) {
      const match = scope.affiliations.find((affiliation) => affiliation.affiliationId === input.affiliationId);
      if (!match) {
        throw new NotFoundError('DoctorClinicAffiliation', input.affiliationId);
      }
      affiliations = [match];
    }

    if (affiliations.length === 0) {
      return { items: [] };
    }

    const templates = await this.scheduleTemplates.findByAffiliationIds(
      this.prisma,
      affiliations.map((affiliation) => affiliation.affiliationId),
    );

    const byAffiliationId = new Map(affiliations.map((affiliation) => [affiliation.affiliationId, affiliation]));

    return {
      items: templates.flatMap((template) => {
        const affiliation = byAffiliationId.get(template.doctor_clinic_affiliation_id);
        return affiliation ? [toMyScheduleTemplate(template, affiliation)] : [];
      }),
    };
  }
}
