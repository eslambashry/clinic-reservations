import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface NewSubstitution {
  pharmacyOrderItemId: string;
  originalDrugCode: string;
  substitutedDrugCode: string;
  proposedByUserId: string;
}

@Injectable()
export class SubstitutionRepository {
  createMany(db: Prisma.TransactionClient, rows: NewSubstitution[]): Promise<Prisma.BatchPayload> {
    return db.substitution.createMany({
      data: rows.map((row) => ({
        pharmacy_order_item_id: row.pharmacyOrderItemId,
        original_drug_code: row.originalDrugCode,
        substituted_drug_code: row.substitutedDrugCode,
        proposed_by_user_id: row.proposedByUserId,
      })),
    });
  }

  findPendingByOrderId(db: Prisma.TransactionClient, pharmacyOrderId: string) {
    return db.substitution.findMany({
      where: { patient_decision: 'PENDING', pharmacy_order_item: { pharmacy_order_id: pharmacyOrderId } },
    });
  }

  findByOrderId(db: Prisma.TransactionClient, pharmacyOrderId: string) {
    return db.substitution.findMany({
      where: { pharmacy_order_item: { pharmacy_order_id: pharmacyOrderId } },
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
