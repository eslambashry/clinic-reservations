import { Injectable } from '@nestjs/common';
import { Prescription, PrescriptionSource, PrescriptionStatus, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface NewPrescription {
  patientId: string;
  source: PrescriptionSource;
  notes?: string;
}

export interface ListQueueParams {
  cursor?: { createdAt: string; id: string };
  limit: number;
}

@Injectable()
export class PrescriptionRepository {
  create(db: Prisma.TransactionClient, input: NewPrescription): Promise<Prescription> {
    return db.prescription.create({
      data: {
        patient_id: input.patientId,
        source: input.source,
        notes: input.notes,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<Prescription | null> {
    return db.prescription.findUnique({ where: { id } });
  }

  /** File 12 Part 37.5: pharmacy-staff queue, unscoped by branch (no routing mechanism exists until Phase 7). */
  listQualityCheckPassed(db: Prisma.TransactionClient, params: ListQueueParams): Promise<Prescription[]> {
    return db.prescription.findMany({
      where: {
        status: 'QUALITY_CHECK_PASSED',
        ...(params.cursor && {
          OR: [
            { created_at: { gt: new Date(params.cursor.createdAt) } },
            { created_at: new Date(params.cursor.createdAt), id: { gt: params.cursor.id } },
          ],
        }),
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: params.limit,
    });
  }

  /** Version-guarded — throws `OptimisticLockError` on a concurrent write, translated centrally to `409 OPTIMISTIC_LOCK_CONFLICT`. */
  async setStatus(db: Prisma.TransactionClient, id: string, currentVersion: number, status: PrescriptionStatus): Promise<void> {
    await updateWithOptimisticLock(db.prescription, id, currentVersion, { status });
  }
}
