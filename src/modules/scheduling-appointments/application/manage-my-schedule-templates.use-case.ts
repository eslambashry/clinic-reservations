import { Inject, Injectable } from '@nestjs/common';
import { ScheduleTemplate } from '@prisma/client';
import { DoctorAffiliationScope, ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreateScheduleTemplateUseCase } from './create-schedule-template.use-case';
import { DeleteScheduleTemplateUseCase } from './delete-schedule-template.use-case';
import { MyScheduleTemplate, toMyScheduleTemplate } from './doctor-schedule-template.mapper';
import { UpdateScheduleTemplateUseCase } from './update-schedule-template.use-case';
import { UpdateScheduleTemplateInput } from '../infrastructure/schedule-template.repository';

export interface CreateMyScheduleTemplateInput {
  doctorClinicAffiliationId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
}

export interface UpdateMyScheduleTemplateInput extends UpdateScheduleTemplateInput {
  version?: number;
}

/**
 * `POST/PATCH/DELETE /v1/doctors/me/schedule-templates[/{id}]` (File 12 Part
 * 49.5/49.6).
 *
 * This is a **thin ownership shell** over the existing Admin use-cases, not
 * a second implementation: window validation, the `audit_logs` write, the
 * optimistic lock and Part 33.8's "future generation only" semantics all
 * still live in `Create/Update/DeleteScheduleTemplateUseCase`. All this
 * class adds is "which affiliations may this JWT touch", resolved from
 * `ResolveDoctorScopeUseCase` and pushed *into* those use-cases as an
 * `assertOwned` predicate so the ownership check happens inside the same
 * transaction as the write — not in a controller, and not in a read that
 * could go stale before the write lands.
 */
@Injectable()
export class ManageMyScheduleTemplatesUseCase {
  constructor(
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(CreateScheduleTemplateUseCase) private readonly createTemplate: CreateScheduleTemplateUseCase,
    @Inject(UpdateScheduleTemplateUseCase) private readonly updateTemplate: UpdateScheduleTemplateUseCase,
    @Inject(DeleteScheduleTemplateUseCase) private readonly deleteTemplate: DeleteScheduleTemplateUseCase,
  ) {}

  async create(input: CreateMyScheduleTemplateInput, actor: AccessTokenPayload): Promise<MyScheduleTemplate> {
    const affiliation = await this.requireOwnedAffiliation(actor, input.doctorClinicAffiliationId);
    const template = await this.createTemplate.execute(input, actor);
    return toMyScheduleTemplate(template, affiliation);
  }

  async update(scheduleTemplateId: string, input: UpdateMyScheduleTemplateInput, actor: AccessTokenPayload): Promise<MyScheduleTemplate> {
    const { version, ...fields } = input;
    const ownedAffiliationIds = await this.ownedAffiliationIds(actor);

    const template = await this.updateTemplate.execute(scheduleTemplateId, fields, actor, {
      expectedVersion: version,
      assertOwned: (row) => ownedAffiliationIds.has(row.doctor_clinic_affiliation_id),
    });

    return toMyScheduleTemplate(template, await this.requireOwnedAffiliation(actor, template.doctor_clinic_affiliation_id));
  }

  async remove(scheduleTemplateId: string, version: number | undefined, actor: AccessTokenPayload): Promise<void> {
    const ownedAffiliationIds = await this.ownedAffiliationIds(actor);

    await this.deleteTemplate.execute(scheduleTemplateId, actor, {
      expectedVersion: version,
      assertOwned: (row: ScheduleTemplate) => ownedAffiliationIds.has(row.doctor_clinic_affiliation_id),
    });
  }

  private async ownedAffiliationIds(actor: AccessTokenPayload): Promise<Set<string>> {
    const scope = await this.doctorScope.execute(actor);
    return new Set(scope.affiliationIds);
  }

  private async requireOwnedAffiliation(actor: AccessTokenPayload, affiliationId: string): Promise<DoctorAffiliationScope> {
    const scope = await this.doctorScope.execute(actor);
    const affiliation = scope.affiliations.find((candidate) => candidate.affiliationId === affiliationId);
    if (!affiliation) {
      // Existence hiding (Part 35.11): an affiliation the caller doesn't own
      // is indistinguishable from one that doesn't exist.
      throw new NotFoundError('DoctorClinicAffiliation', affiliationId);
    }
    return affiliation;
  }
}
