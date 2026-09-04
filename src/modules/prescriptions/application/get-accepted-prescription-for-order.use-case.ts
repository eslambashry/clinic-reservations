import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrescriptionItemRepository } from '../infrastructure/prescription-item.repository';
import { PrescriptionRepository } from '../infrastructure/prescription.repository';

export interface FulfillableItem {
  id: string;
  drugCode: string | null;
  quantity: number;
}

export interface AcceptedPrescriptionForOrder {
  prescriptionId: string;
  items: FulfillableItem[];
}

/**
 * File 12 Part 39.3 — `pharmacy-fulfillment`'s only way to read a
 * prescription's fulfillable items when creating a `PharmacyOrder`. Same
 * shape as `GetAffiliationBillingInfoUseCase` (Part 36.3): takes `tx`
 * explicitly so the read participates in the caller's own transaction, and
 * does the minimum validation intrinsic to "is this prescription valid to
 * build an order from" — ownership and status — while leaving order-specific
 * rules (does it have any fulfillable items, does an order already exist) to
 * the caller, same division of responsibility that use-case already
 * established.
 *
 * File 12 Part 44: accepts `QUALITY_CHECK_PASSED` as well as `ACCEPTED` —
 * `ACCEPTED` only comes from a `PHARMACY_STAFF` review endpoint nothing in
 * the current ecosystem ever calls (verified against
 * `medsuper-pharmacy-dashboard`'s own API client).
 *
 * `NotFoundError` covers both "doesn't exist" and "exists but isn't this
 * patient's" — hides existence from a non-owner, the same pattern
 * `GetPrescriptionUseCase` uses for its own owner/staff check.
 */
@Injectable()
export class GetAcceptedPrescriptionForOrderUseCase {
  constructor(
    @Inject(PrescriptionRepository) private readonly prescriptions: PrescriptionRepository,
    @Inject(PrescriptionItemRepository) private readonly items: PrescriptionItemRepository,
  ) {}

  async execute(tx: Prisma.TransactionClient, prescriptionId: string, patientId: string): Promise<AcceptedPrescriptionForOrder> {
    const prescription = await this.prescriptions.findById(tx, prescriptionId);
    if (!prescription || prescription.patient_id !== patientId) {
      throw new NotFoundError('Prescription', prescriptionId);
    }
    if (prescription.status !== 'ACCEPTED' && prescription.status !== 'QUALITY_CHECK_PASSED') {
      throw new BusinessRuleError('PRESCRIPTION_NOT_ACCEPTED', 'لم تجتَز الروشتة فحص الجودة أو مراجعة الصيدلي بعد.');
    }

    const items = await this.items.findByPrescriptionId(tx, prescriptionId);
    // File 12 Part 44: `medsuper-pharmacy-dashboard` never reads/sets
    // `drug_code` at all (its pharmacist quotes a flat total off the
    // prescription image, File 12 Part 40) — requiring a coded item here
    // was a leftover from the pre-Part-40 per-item-pricing design, and
    // `drug_code` can't be set without a review this app has no surface for
    // anyway (see PART 44). A `quantity`-bearing item is fulfillable whether
    // it ended up with a real `drug_code` or only OCR's free-text name.
    const fulfillable = items.filter((item): item is typeof item & { quantity: number } => item.quantity !== null && (item.drug_code !== null || item.drug_name_free_text !== null));

    return {
      prescriptionId: prescription.id,
      items: fulfillable.map((item) => ({ id: item.id, drugCode: item.drug_code, quantity: item.quantity })),
    };
  }
}
