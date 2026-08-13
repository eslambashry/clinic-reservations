import { Injectable } from '@nestjs/common';
import { Prisma, ScheduleTemplate } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface CreateScheduleTemplateInput {
  doctorClinicAffiliationId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
}

export interface UpdateScheduleTemplateInput {
  weekday?: number;
  startTime?: string;
  endTime?: string;
  slotDurationMinutes?: number;
  bufferMinutes?: number;
}

@Injectable()
export class ScheduleTemplateRepository {
  create(db: Prisma.TransactionClient, input: CreateScheduleTemplateInput): Promise<ScheduleTemplate> {
    return db.scheduleTemplate.create({
      data: {
        doctor_clinic_affiliation_id: input.doctorClinicAffiliationId,
        weekday: input.weekday,
        start_time: input.startTime,
        end_time: input.endTime,
        slot_duration_minutes: input.slotDurationMinutes,
        buffer_minutes: input.bufferMinutes,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<ScheduleTemplate | null> {
    return db.scheduleTemplate.findUnique({ where: { id } });
  }

  findByAffiliationId(db: Prisma.TransactionClient, affiliationId: string): Promise<ScheduleTemplate[]> {
    return db.scheduleTemplate.findMany({
      where: { doctor_clinic_affiliation_id: affiliationId },
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
    });
  }

  /** File 12 Part 33.9/33.10 — the slot-generation job's own entry point: every affiliation currently owning at least one template. */
  findDistinctAffiliationIds(db: Prisma.TransactionClient): Promise<string[]> {
    return db.scheduleTemplate
      .findMany({ distinct: ['doctor_clinic_affiliation_id'], select: { doctor_clinic_affiliation_id: true } })
      .then((rows) => rows.map((row) => row.doctor_clinic_affiliation_id));
  }

  async update(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    input: UpdateScheduleTemplateInput,
  ): Promise<void> {
    await updateWithOptimisticLock(db.scheduleTemplate, id, currentVersion, {
      ...(input.weekday !== undefined && { weekday: input.weekday }),
      ...(input.startTime !== undefined && { start_time: input.startTime }),
      ...(input.endTime !== undefined && { end_time: input.endTime }),
      ...(input.slotDurationMinutes !== undefined && { slot_duration_minutes: input.slotDurationMinutes }),
      ...(input.bufferMinutes !== undefined && { buffer_minutes: input.bufferMinutes }),
    });
  }

  /** Part 33.8: hard delete — no `deleted_at` on this table, and not retroactive to already-generated slots. */
  async remove(db: Prisma.TransactionClient, id: string): Promise<void> {
    await db.scheduleTemplate.delete({ where: { id } });
  }
}
