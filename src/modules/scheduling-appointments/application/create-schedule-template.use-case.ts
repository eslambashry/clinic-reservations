import { Inject, Injectable } from '@nestjs/common';
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
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ScheduleTemplateRepository) private readonly scheduleTemplates: ScheduleTemplateRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(input: CreateScheduleTemplateInput, actor: AccessTokenPayload): Promise<ScheduleTemplate> {
    if (!isValidScheduleWindow(input.startTime, input.endTime)) {
      throw new BusinessRuleError('INVALID_SCHEDULE_WINDOW', 'وقت النهاية يجب أن يكون بعد وقت البداية.', {
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

/** Any error other than the FK case gets a fixed, generic message — never the raw driver/DB error text (see the identical note on `translateCreateHoldError`). */
export function translateScheduleTemplateError(error: unknown, affiliationId: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
    return new NotFoundError('DoctorClinicAffiliation', affiliationId);
  }
  return new DomainError(500, 'INTERNAL_ERROR', 'تعذّر إنشاء قالب المواعيد. أعد المحاولة.');
}
