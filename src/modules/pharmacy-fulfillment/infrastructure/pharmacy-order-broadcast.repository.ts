import { Injectable } from '@nestjs/common';
import { BroadcastResponse, PharmacyOrderBroadcast, Prisma } from '@prisma/client';

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

  /** Existence check for "was this order actually broadcast to this branch" — `null` means no, distinct from "broadcast but already responded". */
  findByOrderAndBranch(db: Prisma.TransactionClient, pharmacyOrderId: string, branchId: string): Promise<PharmacyOrderBroadcast | null> {
    return db.pharmacyOrderBroadcast.findFirst({
      where: { pharmacy_order_id: pharmacyOrderId, pharmacy_branch_id: branchId },
    });
  }

  /** `WHERE response IS NULL` guards against double-processing the same broadcast (a double-tap accept+decline race from the same branch) — same conditional-update shape as `PharmacyOrderRepository.claimForBranch`. */
  async markResponded(db: Prisma.TransactionClient, id: string, response: BroadcastResponse): Promise<boolean> {
    const result = await db.pharmacyOrderBroadcast.updateMany({
      where: { id, response: null },
      data: { response, responded_at: new Date() },
    });
    return result.count === 1;
  }
}
