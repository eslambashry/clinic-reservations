import { Injectable } from '@nestjs/common';
import { Prisma, PrescriptionItem } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';
import { OcrSuggestedItem } from '../application/ports/ocr-extractor.port';

@Injectable()
export class PrescriptionItemRepository {
  /** OCR suggestions only — `drug_code` is never set here (File 10 §7.3; the DB trigger would reject it before any review exists anyway). */
  createManySuggested(db: Prisma.TransactionClient, prescriptionId: string, items: OcrSuggestedItem[]): Promise<Prisma.BatchPayload> {
    return db.prescriptionItem.createMany({
      data: items.map((item) => ({
        prescription_id: prescriptionId,
        drug_name_free_text: item.drugNameFreeText,
        dose: item.dose,
        frequency: item.frequency,
        duration_days: item.durationDays,
        quantity: item.quantity,
      })),
    });
  }

  findByPrescriptionId(db: Prisma.TransactionClient, prescriptionId: string): Promise<PrescriptionItem[]> {
    return db.prescriptionItem.findMany({ where: { prescription_id: prescriptionId } });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<PrescriptionItem | null> {
    return db.prescriptionItem.findUnique({ where: { id } });
  }

  /**
   * Version-guarded. Caller must ensure a `prescription_reviews` row for
   * this item's prescription already exists in the same transaction before
   * calling this — the DB trigger
   * (`enforce_prescription_item_drug_code_requires_review`) will reject the
   * write otherwise, surfacing as a raw Postgres exception the caller
   * should translate, not silently retry. Sets `quantity` alongside
   * `drugCode` in the same update (File 12 Part 37.10) — a fulfillable item
   * needs both, and there's no reason to split it into two round trips.
   */
  async setDrugCodeAndQuantity(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    input: { drugCode: string; quantity: number },
  ): Promise<void> {
    await updateWithOptimisticLock(db.prescriptionItem, id, currentVersion, { drug_code: input.drugCode, quantity: input.quantity });
  }

  /**
   * File 12 Part 37.10: the pharmacist-manual-entry path `DEC-005` calls for
   * — creates a brand-new item (not a correction to an OCR-suggested one)
   * with `drugCode`/`quantity` already set. Caller must create the
   * `prescription_reviews` row first, same trigger reasoning as
   * `setDrugCodeAndQuantity` above.
   */
  createReviewed(db: Prisma.TransactionClient, prescriptionId: string, input: { drugCode: string; quantity: number }): Promise<PrescriptionItem> {
    return db.prescriptionItem.create({
      data: { prescription_id: prescriptionId, drug_code: input.drugCode, quantity: input.quantity },
    });
  }
}
