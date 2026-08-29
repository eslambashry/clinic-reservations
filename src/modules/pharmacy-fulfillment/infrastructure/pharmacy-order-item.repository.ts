import { Injectable } from '@nestjs/common';
import { PharmacyOrderItem, PharmacyOrderItemStatus, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface NewPharmacyOrderItem {
  prescriptionItemId: string;
  quantity: number;
}

export interface QuoteUpdate {
  status: PharmacyOrderItemStatus;
  unitPrice: string | null;
  substitutedDrugCode: string | null;
}

@Injectable()
export class PharmacyOrderItemRepository {
  createMany(db: Prisma.TransactionClient, pharmacyOrderId: string, items: NewPharmacyOrderItem[]): Promise<Prisma.BatchPayload> {
    return db.pharmacyOrderItem.createMany({
      data: items.map((item) => ({
        pharmacy_order_id: pharmacyOrderId,
        prescription_item_id: item.prescriptionItemId,
        quantity: item.quantity,
      })),
    });
  }

  findByOrderId(db: Prisma.TransactionClient, pharmacyOrderId: string): Promise<PharmacyOrderItem[]> {
    return db.pharmacyOrderItem.findMany({ where: { pharmacy_order_id: pharmacyOrderId } });
  }

  /** No concurrency race here — a single pharmacist submits one quote — so the shared optimistic-lock helper (generic `409` on a stale version) is sufficient, unlike the first-accept-wins paths. */
  async updateQuote(db: Prisma.TransactionClient, id: string, currentVersion: number, input: QuoteUpdate): Promise<void> {
    await updateWithOptimisticLock(db.pharmacyOrderItem, id, currentVersion, {
      status: input.status,
      unit_price: input.unitPrice,
      substituted_drug_code: input.substitutedDrugCode,
    });
  }
}
