import { Injectable } from '@nestjs/common';
import { FulfillmentType, PharmacyOrder, PharmacyOrderRejectionReason, PharmacyOrderStatus, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface NewPharmacyOrder {
  prescriptionId: string;
  patientId: string;
  fulfillmentType: FulfillmentType;
}

export interface FlatQuote {
  totalPrice: string;
  currency: string;
  estimatedReadyMinutes: number;
  note: string | null;
}

export interface OrderRejection {
  reason: PharmacyOrderRejectionReason;
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
  status?: PharmacyOrderStatus;
}

/** Keyset cursor filter, direction-aware — factored out so both list queries below build it identically. */
function cursorFilter(cursor: ListOrdersCursor | undefined, direction: 'asc' | 'desc'): Prisma.PharmacyOrderWhereInput[] {
  if (!cursor) {
    return [];
  }
  const createdAt = new Date(cursor.createdAt);
  return direction === 'asc'
    ? [{ OR: [{ created_at: { gt: createdAt } }, { created_at: createdAt, id: { gt: cursor.id } }] }]
    : [{ OR: [{ created_at: { lt: createdAt } }, { created_at: createdAt, id: { lt: cursor.id } }] }];
}

@Injectable()
export class PharmacyOrderRepository {
  create(db: Prisma.TransactionClient, input: NewPharmacyOrder): Promise<PharmacyOrder> {
    return db.pharmacyOrder.create({
      data: {
        prescription_id: input.prescriptionId,
        patient_id: input.patientId,
        fulfillment_type: input.fulfillmentType,
      },
    });
  }

  /** Most recent order for this prescription, if any — callers check its status against `isActiveOrderStatus`. */
  findLatestByPrescriptionId(db: Prisma.TransactionClient, prescriptionId: string): Promise<PharmacyOrder | null> {
    return db.pharmacyOrder.findFirst({
      where: { prescription_id: prescriptionId },
      orderBy: { created_at: 'desc' },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<PharmacyOrder | null> {
    return db.pharmacyOrder.findUnique({ where: { id } });
  }

  /**
   * File 11 line 456, verbatim: the first-accept-wins mechanism. A 0-row
   * result means either another branch already claimed this order, or the
   * caller's `currentVersion` is stale — both collapse to the same
   * `ORDER_ALREADY_CLAIMED` outcome from the caller's perspective, so this
   * returns a plain boolean rather than distinguishing them.
   */
  async claimForBranch(db: Prisma.TransactionClient, id: string, currentVersion: number, branchId: string): Promise<boolean> {
    const result = await db.pharmacyOrder.updateMany({
      where: { id, version: currentVersion, pharmacy_branch_id: null },
      data: { pharmacy_branch_id: branchId, status: 'UNDER_REVIEW', version: { increment: 1 } },
    });
    return result.count === 1;
  }

  /** Version-guarded — no concurrency race here (the pharmacist quote and patient reject/approve steps are each one actor acting once), so the generic optimistic-lock helper is sufficient. */
  async setStatus(db: Prisma.TransactionClient, id: string, currentVersion: number, status: PharmacyOrderStatus): Promise<void> {
    await updateWithOptimisticLock(db.pharmacyOrder, id, currentVersion, { status });
  }

  /**
   * File 11 Part 14 (`ACCEPTED --> PAID: payment_intent captured`). A
   * conditional `updateMany` rather than the shared optimistic-lock helper
   * (which throws) — the caller (`ApprovePharmacyOrderUseCase`) needs a
   * plain boolean to guard the same "patient double-clicks approve" race
   * `ConfirmAppointmentUseCase` relies on `holds.markConverted` for.
   */
  async markPaid(db: Prisma.TransactionClient, id: string, currentVersion: number, paymentIntentId: string): Promise<boolean> {
    const result = await db.pharmacyOrder.updateMany({
      where: { id, version: currentVersion },
      data: { status: 'PAID', payment_intent_id: paymentIntentId, version: { increment: 1 } },
    });
    return result.count === 1;
  }

  /** 2026-08-29: `UNDER_REVIEW --> ACCEPTED` with the pharmacist's flat total — no per-item pricing (see domain/pharmacy-order-quote.rules.ts). */
  async submitQuote(db: Prisma.TransactionClient, id: string, currentVersion: number, quote: FlatQuote): Promise<void> {
    await updateWithOptimisticLock(db.pharmacyOrder, id, currentVersion, {
      status: 'ACCEPTED',
      total_price: quote.totalPrice,
      currency: quote.currency,
      estimated_ready_minutes: quote.estimatedReadyMinutes,
      staff_note: quote.note,
      quoted_at: new Date(),
    });
  }

  /** `UNDER_REVIEW --> REJECTED`, pharmacy-staff-initiated (distinct from the patient's substitution-reject path). */
  async rejectOrder(db: Prisma.TransactionClient, id: string, currentVersion: number, rejection: OrderRejection): Promise<void> {
    await updateWithOptimisticLock(db.pharmacyOrder, id, currentVersion, {
      status: 'REJECTED',
      rejection_reason: rejection.reason,
      rejection_note: rejection.note,
      rejected_at: new Date(),
    });
  }

  /**
   * The pharmacy-staff queue: orders this branch has already claimed, plus
   * orders currently broadcast to it that it hasn't responded to yet (the
   * "incoming, needs accept/decline" set) — no query for this existed
   * anywhere before (File 12 Part 39 item 11 named it as a future pass).
   * Keyset-paginated on (created_at, id), same convention as
   * `ListPrescriptionsUseCase`.
   */
  findForBranch(db: Prisma.TransactionClient, branchId: string, page: ListOrdersPage): Promise<PharmacyOrder[]> {
    return db.pharmacyOrder.findMany({
      where: {
        AND: [
          {
            OR: [
              { pharmacy_branch_id: branchId },
              { status: 'RECEIVED', broadcasts: { some: { pharmacy_branch_id: branchId, response: null } } },
            ],
          },
          ...(page.status ? [{ status: page.status }] : []),
          ...cursorFilter(page.cursor, page.sortDirection),
        ],
      },
      orderBy: [{ created_at: page.sortDirection }, { id: page.sortDirection }],
      take: page.limit,
    });
  }

  /** The patient's own orders — no cross-patient visibility, same convention as appointments' own list endpoint. */
  findForPatient(db: Prisma.TransactionClient, patientId: string, page: ListOrdersPage): Promise<PharmacyOrder[]> {
    return db.pharmacyOrder.findMany({
      where: {
        AND: [{ patient_id: patientId }, ...(page.status ? [{ status: page.status }] : []), ...cursorFilter(page.cursor, page.sortDirection)],
      },
      orderBy: [{ created_at: page.sortDirection }, { id: page.sortDirection }],
      take: page.limit,
    });
  }
}
