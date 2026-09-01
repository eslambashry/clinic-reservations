import { Injectable } from '@nestjs/common';
import { LabOrderItem, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface NewLabOrderItem {
  catalogCode: string;
}

@Injectable()
export class LabOrderItemRepository {
  createMany(db: Prisma.TransactionClient, labOrderId: string, items: NewLabOrderItem[]): Promise<Prisma.BatchPayload> {
    return db.labOrderItem.createMany({
      data: items.map((item) => ({ lab_order_id: labOrderId, catalog_code: item.catalogCode })),
    });
  }

  findByOrderId(db: Prisma.TransactionClient, labOrderId: string): Promise<LabOrderItem[]> {
    return db.labOrderItem.findMany({ where: { lab_order_id: labOrderId } });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<LabOrderItem | null> {
    return db.labOrderItem.findUnique({ where: { id } });
  }

  setUnitPrice(db: Prisma.TransactionClient, labOrderId: string, unitPrice: string): Promise<Prisma.BatchPayload> {
    return db.labOrderItem.updateMany({ where: { lab_order_id: labOrderId }, data: { unit_price: unitPrice } });
  }

  async markRecorded(db: Prisma.TransactionClient, id: string, currentVersion: number): Promise<void> {
    await updateWithOptimisticLock(db.labOrderItem, id, currentVersion, { result_state: 'RECORDED' });
  }

  /** Resets every item on the order back to PENDING — mirrors the mock's `rejectSample` (a rejected sample invalidates every result recorded against it). */
  resetToPending(db: Prisma.TransactionClient, labOrderId: string): Promise<Prisma.BatchPayload> {
    return db.labOrderItem.updateMany({ where: { lab_order_id: labOrderId }, data: { result_state: 'PENDING' } });
  }
}
