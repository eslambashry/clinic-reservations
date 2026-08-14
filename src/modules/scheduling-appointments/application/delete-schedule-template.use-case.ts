import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ScheduleTemplateRepository } from '../infrastructure/schedule-template.repository';

/**
 * File 12 Part 33.8: not retroactive — deleting a template only stops
 * future slot-generation runs from using it, already-materialized
 * `appointment_slots` are untouched (no FK links a slot back to its
 * template in the given schema).
 */
@Injectable()
export class DeleteScheduleTemplateUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleTemplates: ScheduleTemplateRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(scheduleTemplateId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const template = await this.scheduleTemplates.findById(tx, scheduleTemplateId);
      if (!template) {
        throw new NotFoundError('ScheduleTemplate', scheduleTemplateId);
      }

      await this.scheduleTemplates.remove(tx, scheduleTemplateId, template.version);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.schedule_template.delete',
        resourceType: 'schedule_template',
        resourceId: scheduleTemplateId,
      });
    });
  }
}
