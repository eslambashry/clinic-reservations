import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrescriptionItemRepository } from '../infrastructure/prescription-item.repository';

/**
 * File 12 Part 39: `pharmacy-fulfillment`'s only way to read a
 * `PrescriptionItem.drug_code` when building a `Substitution` row's
 * `original_drug_code` — `PharmacyOrderItem` has no `drug_code` column of
 * its own, only the `prescription_item_id` FK. Unlike
 * `GetAcceptedPrescriptionForOrderUseCase`, this does no ownership/status
 * validation — the caller (pharmacy-fulfillment) already legitimately owns
 * these ids via its own `PharmacyOrderItem` rows, so this is a plain lookup,
 * not an authorization boundary.
 */
@Injectable()
export class GetPrescriptionItemDrugCodesUseCase {
  constructor(@Inject(PrescriptionItemRepository) private readonly items: PrescriptionItemRepository) {}

  async execute(tx: Prisma.TransactionClient, prescriptionItemIds: string[]): Promise<Map<string, string>> {
    const items = await this.items.findManyByIds(tx, prescriptionItemIds);
    const result = new Map<string, string>();
    for (const item of items) {
      if (item.drug_code !== null) {
        result.set(item.id, item.drug_code);
      }
    }
    return result;
  }
}
