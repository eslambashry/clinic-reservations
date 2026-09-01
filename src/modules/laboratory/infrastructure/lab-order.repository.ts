import { Injectable } from '@nestjs/common';
import { LabOrder, LabOrderStatus, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface NewLabOrder {
  patientId: string;
  labBranchId: string;
  prescriptionId?: string;
  collectionType: 'VISIT' | 'HOME_COLLECTION';
}

export interface FlatLabQuote {
  totalPrice: string;
  currency: string;
  appointmentAt: Date;
  prepInstructions: string;
  queueNumber: number;
}

export interface LabOrderRejection {
  reason: string;
  note: string | null;
}

export interface ListOrdersCursor {
  createdAt: string;
  id: string;
}

export interface ListOrdersPage {
  cursor?: ListOrdersCursor;
  limit: number;
  sortDirection: 'asc' | 'desc';
  status?: LabOrderStatus;
}

/** Keyset cursor filter, direction-aware — mirrors `PharmacyOrderRepository`'s own helper exactly. */
function cursorFilter(cursor: ListOrdersCursor | undefined, direction: 'asc' | 'desc'): Prisma.LabOrderWhereInput[] {
  if (!cursor) {
    return [];
  }
  const createdAt = new Date(cursor.createdAt);
  return direction === 'asc'
    ? [{ OR: [{ created_at: { gt: createdAt } }, { created_at: createdAt, id: { gt: cursor.id } }] }]
    : [{ OR: [{ created_at: { lt: createdAt } }, { created_at: createdAt, id: { lt: cursor.id } }] }];
}

@Injectable()
export class LabOrderRepository {
  create(db: Prisma.TransactionClient, input: NewLabOrder): Promise<LabOrder> {
    return db.labOrder.create({
      data: {
        patient_id: input.patientId,
        lab_branch_id: input.labBranchId,
        prescription_id: input.prescriptionId,
        collection_type: input.collectionType,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<LabOrder | null> {
    return db.labOrder.findUnique({ where: { id } });
  }

  findForPatient(db: Prisma.TransactionClient, patientId: string, page: ListOrdersPage): Promise<LabOrder[]> {
    return db.labOrder.findMany({
      where: {
        AND: [{ patient_id: patientId }, ...(page.status ? [{ status: page.status }] : []), ...cursorFilter(page.cursor, page.sortDirection)],
      },
      orderBy: [{ created_at: page.sortDirection }, { id: page.sortDirection }],
      take: page.limit,
    });
  }

  /** The lab-staff queue: every order assigned to this branch (a lab order is assigned to exactly one branch at creation — no broadcast/claim step like pharmacy's). */
  findForBranch(db: Prisma.TransactionClient, branchId: string, page: ListOrdersPage): Promise<LabOrder[]> {
    return db.labOrder.findMany({
      where: {
        AND: [{ lab_branch_id: branchId }, ...(page.status ? [{ status: page.status }] : []), ...cursorFilter(page.cursor, page.sortDirection)],
      },
      orderBy: [{ created_at: page.sortDirection }, { id: page.sortDirection }],
      take: page.limit,
    });
  }

  /** Every order this branch has ever owned, unpaginated — backs `ListLabAuditUseCase`, mirroring `PharmacyOrderRepository.findAllForBranch`. */
  findAllForBranch(db: Prisma.TransactionClient, branchId: string): Promise<LabOrder[]> {
    return db.labOrder.findMany({ where: { lab_branch_id: branchId } });
  }

  async setStatus(db: Prisma.TransactionClient, id: string, currentVersion: number, status: LabOrderStatus): Promise<void> {
    await updateWithOptimisticLock(db.labOrder, id, currentVersion, { status });
  }

  /** `REQUESTED --> QUOTED`, setting the flat quote + the patient's queue slot for the day. */
  async submitQuote(db: Prisma.TransactionClient, id: string, currentVersion: number, quote: FlatLabQuote): Promise<void> {
    await updateWithOptimisticLock(db.labOrder, id, currentVersion, {
      status: 'QUOTED',
      total_price: quote.totalPrice,
      currency: quote.currency,
      appointment_at: quote.appointmentAt,
      prep_instructions: quote.prepInstructions,
      queue_number: quote.queueNumber,
      quoted_at: new Date(),
    });
  }

  /** `QUOTED --> AWAITING_SAMPLE`, issuing the booking code — the transition the dashboard's own mock never implements. */
  async confirmBooking(db: Prisma.TransactionClient, id: string, currentVersion: number, bookingCode: string): Promise<void> {
    await updateWithOptimisticLock(db.labOrder, id, currentVersion, {
      status: 'AWAITING_SAMPLE',
      booking_code: bookingCode,
    });
  }

  async rescheduleAppointment(db: Prisma.TransactionClient, id: string, currentVersion: number, appointmentAt: Date): Promise<void> {
    await updateWithOptimisticLock(db.labOrder, id, currentVersion, { appointment_at: appointmentAt });
  }

  async setRecollectionRequired(db: Prisma.TransactionClient, id: string, currentVersion: number, required: boolean): Promise<void> {
    await updateWithOptimisticLock(db.labOrder, id, currentVersion, { recollection_required: required });
  }

  /**
   * A rejected sample sets `recollection_required` and, if analysis had
   * already started, reverts the order back to `AWAITING_SAMPLE` — both in
   * one `updateWithOptimisticLock` call (never two sequential calls against
   * the same row/version in one transaction, which would spuriously 409 on
   * the second call since the first already incremented `version`).
   */
  async rejectSample(db: Prisma.TransactionClient, id: string, currentVersion: number, revertToAwaitingSample: boolean): Promise<void> {
    await updateWithOptimisticLock(db.labOrder, id, currentVersion, {
      recollection_required: true,
      ...(revertToAwaitingSample ? { status: 'AWAITING_SAMPLE' as const } : {}),
    });
  }

  async rejectOrder(db: Prisma.TransactionClient, id: string, currentVersion: number, rejection: LabOrderRejection): Promise<void> {
    await updateWithOptimisticLock(db.labOrder, id, currentVersion, {
      status: 'REJECTED',
      rejection_reason: rejection.reason,
      rejection_note: rejection.note,
      rejected_at: new Date(),
    });
  }
}
