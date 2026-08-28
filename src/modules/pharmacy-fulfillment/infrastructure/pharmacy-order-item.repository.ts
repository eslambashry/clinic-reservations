import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface NewPharmacyOrderItem {
  prescriptionItemId: string;
  quantity: number;
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
}
