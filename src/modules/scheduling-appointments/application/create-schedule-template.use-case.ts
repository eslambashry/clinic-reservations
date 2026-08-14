import { Injectable } from '@nestjs/common';
import { Prisma, ScheduleTemplate } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, DomainError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { isValidScheduleWindow } from '../domain/slot-generation.rules';
import { CreateScheduleTemplateInput, ScheduleTemplateRepository } from '../infrastructure/schedule-template.repository';

/**
 * File 12 Part 33.1/33.2: Admin-only — no endpoint for this is documented
 * in File 11 05.x, so this is a new engineering-decided surface, following
 * Phase 2's Admin-CRUD precedent exactly.
 */
@Injectable()
export class CreateScheduleTemplateUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleTemplates: ScheduleTemplateRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(input: CreateScheduleTemplateInput, actor: AccessTokenPayload): Promise<ScheduleTemplate> {
    if (!isValidScheduleWindow(input.startTime, input.endTime)) {
      throw new BusinessRuleError('INVALID_SCHEDULE_WINDOW', 'endTime must be after startTime.', {
        startTime: input.startTime,
        endTime: input.endTime,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      let template: ScheduleTemplate;
      try {
        template = await this.scheduleTemplates.create(tx, input);
      } catch (error) {
        throw translateScheduleTemplateError(error, input.doctorClinicAffiliationId);
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.schedule_template.create',
        resourceType: 'schedule_template',
        resourceId: template.id,
      });

      return template;
    });
  }
}

export function translateScheduleTemplateError(error: unknown, affiliationId: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
    return new NotFoundError('DoctorClinicAffiliation', affiliationId);
  }
  return new DomainError(500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unexpected error while creating the schedule template.');
}
