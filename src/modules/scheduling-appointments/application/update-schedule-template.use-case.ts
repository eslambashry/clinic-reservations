import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ScheduleTemplateRepository, UpdateScheduleTemplateInput } from '../infrastructure/schedule-template.repository';

@Injectable()
export class UpdateScheduleTemplateUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleTemplates: ScheduleTemplateRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(scheduleTemplateId: string, input: UpdateScheduleTemplateInput, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const template = await this.scheduleTemplates.findById(tx, scheduleTemplateId);
      if (!template) {
        throw new NotFoundError('ScheduleTemplate', scheduleTemplateId);
      }

      const startTime = input.startTime ?? template.start_time;
      const endTime = input.endTime ?? template.end_time;
      if (endTime <= startTime) {
        throw new BusinessRuleError('INVALID_SCHEDULE_WINDOW', 'endTime must be after startTime.', { startTime, endTime });
      }

      await this.scheduleTemplates.update(tx, scheduleTemplateId, template.version, input);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.schedule_template.update',
        resourceType: 'schedule_template',
        resourceId: scheduleTemplateId,
      });
    });
  }
}
