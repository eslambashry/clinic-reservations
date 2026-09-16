import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class SubstitutionRepository {
  findPendingByOrderId(db: Prisma.TransactionClient, pharmacyOrderId: string) {
    return db.substitution.findMany({
      where: { patient_decision: 'PENDING', pharmacy_order_item: { pharmacy_order_id: pharmacyOrderId } },
    });
  }

  /** File 11 Part 14 (`SUBSTITUTION_PROPOSED --> REJECTED: patient rejects`) — every still-`PENDING` substitution on this order is rejected in one shot; there's exactly one round, so nothing stays PENDING afterward. */
  rejectAllPendingForOrder(db: Prisma.TransactionClient, pharmacyOrderId: string): Promise<Prisma.BatchPayload> {
    return db.substitution.updateMany({
      where: { patient_decision: 'PENDING', pharmacy_order_item: { pharmacy_order_id: pharmacyOrderId } },
      data: { patient_decision: 'REJECTED', decided_at: new Date() },
    });
  }
}
