import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class PharmacyOrderBroadcastRepository {
  /** File 11 line 276: one row per candidate branch, `response` left null until that branch answers (or the future timeout job marks it TIMEOUT — File 12 Part 39.4). */
  createMany(db: Prisma.TransactionClient, pharmacyOrderId: string, branchIds: string[]): Promise<Prisma.BatchPayload> {
    return db.pharmacyOrderBroadcast.createMany({
      data: branchIds.map((branchId) => ({
        pharmacy_order_id: pharmacyOrderId,
        pharmacy_branch_id: branchId,
      })),
    });
  }
}
