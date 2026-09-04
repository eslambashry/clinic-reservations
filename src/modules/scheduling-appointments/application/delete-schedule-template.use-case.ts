import { Inject, Injectable } from '@nestjs/common';
import { ScheduleTemplate } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ScheduleTemplateRepository } from '../infrastructure/schedule-template.repository';

export interface DeleteScheduleTemplateOptions {
  /** File 12 Part 49.6 — see `UpdateScheduleTemplateOptions.expectedVersion`. */
  expectedVersion?: number;
  /** File 12 Part 49.5 — doctor-scoped ownership assertion; `false` is reported as a 404, never a 403. */
  assertOwned?: (template: ScheduleTemplate) => boolean;
}

/**
 * File 12 Part 33.8: not retroactive — deleting a template only stops
 * future slot-generation runs from using it, already-materialized
 * `appointment_slots` are untouched (no FK links a slot back to its
 * template in the given schema). This is what keeps a schedule edit from
 * silently invalidating slots patients already hold or booked (File 11
 * 05.3's explicit business rule); the Doctor Dashboard states it in the
 * delete confirmation rather than implying the calendar clears.
 */
@Injectable()
export class DeleteScheduleTemplateUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ScheduleTemplateRepository) private readonly scheduleTemplates: ScheduleTemplateRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(scheduleTemplateId: string, actor: AccessTokenPayload, options: DeleteScheduleTemplateOptions = {}): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const template = await this.scheduleTemplates.findById(tx, scheduleTemplateId);
      if (!template || (options.assertOwned && !options.assertOwned(template))) {
        throw new NotFoundError('ScheduleTemplate', scheduleTemplateId);
      }

      if (options.expectedVersion !== undefined && options.expectedVersion !== template.version) {
        throw new ConflictError(
          'OPTIMISTIC_LOCK_CONFLICT',
          'This schedule was changed since you loaded it. Reload and try again.',
          { scheduleTemplateId, expectedVersion: options.expectedVersion, currentVersion: template.version },
        );
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
