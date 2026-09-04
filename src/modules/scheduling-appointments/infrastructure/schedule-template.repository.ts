import { Injectable } from '@nestjs/common';
import { Prisma, ScheduleTemplate } from '@prisma/client';
import { OptimisticLockError, updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

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

  /**
   * File 12 Part 49.5 — batch form for the doctor-facing list: a doctor
   * affiliated with two branches gets one combined weekly plan in a single
   * query rather than N sequential `findByAffiliationId` calls. The caller
   * has already narrowed `affiliationIds` to ids it owns.
   */
  findByAffiliationIds(db: Prisma.TransactionClient, affiliationIds: string[]): Promise<ScheduleTemplate[]> {
    if (affiliationIds.length === 0) {
      return Promise.resolve([]);
    }
    return db.scheduleTemplate.findMany({
      where: { doctor_clinic_affiliation_id: { in: affiliationIds } },
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }, { id: 'asc' }],
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

  /**
   * Part 33.8: hard delete — no `deleted_at` on this table, and not
   * retroactive to already-generated slots. Version-guarded like `update`
   * (via a conditional delete rather than `updateWithOptimisticLock`, which
   * only knows how to `updateMany`) so a delete racing a concurrent
   * update/delete throws `OptimisticLockError` (-> 409) instead of a raw
   * Prisma "record not found" (-> 500).
   */
  async remove(db: Prisma.TransactionClient, id: string, currentVersion: number): Promise<void> {
    const result = await db.scheduleTemplate.deleteMany({ where: { id, version: currentVersion } });
    if (result.count === 0) {
      throw new OptimisticLockError(id, currentVersion);
    }
  }
}
