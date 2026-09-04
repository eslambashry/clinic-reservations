import { Inject, Injectable } from '@nestjs/common';
import { ScheduleTemplate } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { isValidScheduleWindow } from '../domain/slot-generation.rules';
import { ScheduleTemplateRepository, UpdateScheduleTemplateInput } from '../infrastructure/schedule-template.repository';

export interface UpdateScheduleTemplateOptions {
  /**
   * File 12 Part 49.6 — client-supplied optimistic-lock token. The Admin
   * route omits it and keeps its original read-then-write behaviour; the
   * doctor-facing route round-trips the `version` it read, so a stale edit
   * loses with `409 OPTIMISTIC_LOCK_CONFLICT` instead of silently clobbering
   * a concurrent change. Checked inside the same transaction as the write.
   */
  expectedVersion?: number;
  /**
   * File 12 Part 49.5 — ownership assertion the caller (a doctor-scoped
   * use-case) supplies. Returning `false` means the template belongs to
   * someone else and must be reported as a 404, never a 403.
   */
  assertOwned?: (template: ScheduleTemplate) => boolean;
}

@Injectable()
export class UpdateScheduleTemplateUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ScheduleTemplateRepository) private readonly scheduleTemplates: ScheduleTemplateRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(
    scheduleTemplateId: string,
    input: UpdateScheduleTemplateInput,
    actor: AccessTokenPayload,
    options: UpdateScheduleTemplateOptions = {},
  ): Promise<ScheduleTemplate> {
    return this.prisma.$transaction(async (tx) => {
      const template = await this.scheduleTemplates.findById(tx, scheduleTemplateId);
      if (!template || (options.assertOwned && !options.assertOwned(template))) {
        throw new NotFoundError('ScheduleTemplate', scheduleTemplateId);
      }

      if (options.expectedVersion !== undefined && options.expectedVersion !== template.version) {
        throw new ConflictError(
          'OPTIMISTIC_LOCK_CONFLICT',
          'تم تعديل جدول المواعيد بعد فتحك للصفحة. حدّث الصفحة ثم أعد المحاولة.',
          { scheduleTemplateId, expectedVersion: options.expectedVersion, currentVersion: template.version },
        );
      }

      const startTime = input.startTime ?? template.start_time;
      const endTime = input.endTime ?? template.end_time;
      if (!isValidScheduleWindow(startTime, endTime)) {
        throw new BusinessRuleError('INVALID_SCHEDULE_WINDOW', 'وقت النهاية يجب أن يكون بعد وقت البداية.', { startTime, endTime });
      }

      await this.scheduleTemplates.update(tx, scheduleTemplateId, template.version, input);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.schedule_template.update',
        resourceType: 'schedule_template',
        resourceId: scheduleTemplateId,
      });

      const updated = await this.scheduleTemplates.findById(tx, scheduleTemplateId);
      if (!updated) {
        throw new NotFoundError('ScheduleTemplate', scheduleTemplateId);
      }
      return updated;
    });
  }
}
