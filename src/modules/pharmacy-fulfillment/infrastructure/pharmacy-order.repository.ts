import { Injectable } from '@nestjs/common';
import { FulfillmentType, PharmacyOrder, PharmacyOrderStatus, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface NewPharmacyOrder {
  prescriptionId: string;
  patientId: string;
  fulfillmentType: FulfillmentType;
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
}
