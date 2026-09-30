import { Injectable } from '@nestjs/common';
import { Prescription, PrescriptionDocumentType, PrescriptionSource, PrescriptionStatus, Prisma, RoleContextType } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface NewPrescription {
  patientId: string;
  source: PrescriptionSource;
  documentType?: PrescriptionDocumentType;
  notes?: string;
  /** File 12 Part 51 — provider clinical requests, all optional/null for the existing patient-upload path. */
  doctorId?: string;
  createdByUserId?: string;
  createdByRole?: RoleContextType;
  appointmentId?: string;
  batchId?: string;
  status?: PrescriptionStatus;
}

/** File 12 Part 51 — the doctor's decision on a `PENDING_DOCTOR_APPROVAL` draft (approve or reject). */
export interface PrescriptionApprovalDecision {
  decidedByUserId: string;
  decidedAt: Date;
  rejectionReason?: string;
}

export interface ListQueueParams {
  cursor?: { createdAt: string; id: string };
  limit: number;
}

export interface ListProviderPrescriptionsParams {
  documentType?: PrescriptionDocumentType;
  status?: PrescriptionStatus;
  cursor?: { createdAt: string; id: string };
  limit: number;
  createdByUserId?: string;
}

@Injectable()
export class PrescriptionRepository {
  create(db: Prisma.TransactionClient, input: NewPrescription): Promise<Prescription> {
    return db.prescription.create({
      data: {
        patient_id: input.patientId,
        source: input.source,
        document_type: input.documentType,
        notes: input.notes,
        doctor_id: input.doctorId,
        created_by_user_id: input.createdByUserId,
        created_by_role: input.createdByRole,
        appointment_id: input.appointmentId,
        batch_id: input.batchId,
        status: input.status,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<Prescription | null> {
    return db.prescription.findUnique({ where: { id } });
  }

  /** File 12 Part 51: a doctor's own provider-originated prescriptions (direct or assistant-prepared), newest first — backs "my prescriptions"/"pending my approval". */
  findByDoctorId(db: Prisma.TransactionClient, doctorUserId: string, params: ListProviderPrescriptionsParams): Promise<Prescription[]> {
    return db.prescription.findMany({
      where: {
        AND: [
          { doctor_id: doctorUserId },
          ...(params.documentType ? [{ document_type: params.documentType }] : []),
          ...(params.createdByUserId ? [{ created_by_user_id: params.createdByUserId }] : []),
          ...(params.status ? [{ status: params.status }] : []),
          ...(params.cursor ? [{
            OR: [
              { created_at: { lt: new Date(params.cursor.createdAt) } },
              { created_at: new Date(params.cursor.createdAt), id: { lt: params.cursor.id } },
            ],
          }] : []),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: params.limit,
    });
  }

  /**
   * `PENDING_DOCTOR_APPROVAL --> ACCEPTED`, version-guarded. Setting `status`
   * straight to `ACCEPTED` (not a separate "signed" state) is deliberate —
   * see the `PENDING_DOCTOR_APPROVAL` doc comment in `shared.prisma`: this is
   * exactly the value `GetAcceptedPrescriptionForOrderUseCase` already reads,
   * so approval alone is what makes the prescription flow into the existing
   * `PharmacyOrder` path — no separate "activation" step.
   */
  async approve(db: Prisma.TransactionClient, id: string, currentVersion: number, decision: PrescriptionApprovalDecision): Promise<void> {
    await updateWithOptimisticLock(db.prescription, id, currentVersion, {
      status: 'ACCEPTED',
      decided_by_user_id: decision.decidedByUserId,
      approved_at: decision.decidedAt,
    });
  }

  /** `PENDING_DOCTOR_APPROVAL --> REJECTED`, version-guarded. */
  async reject(db: Prisma.TransactionClient, id: string, currentVersion: number, decision: PrescriptionApprovalDecision): Promise<void> {
    await updateWithOptimisticLock(db.prescription, id, currentVersion, {
      status: 'REJECTED',
      decided_by_user_id: decision.decidedByUserId,
      rejected_at: decision.decidedAt,
      rejection_reason: decision.rejectionReason,
    });
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
