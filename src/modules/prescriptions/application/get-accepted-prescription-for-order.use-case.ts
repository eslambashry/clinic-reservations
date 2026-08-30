import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrescriptionItemRepository } from '../infrastructure/prescription-item.repository';
import { PrescriptionRepository } from '../infrastructure/prescription.repository';

export interface FulfillableItem {
  id: string;
  drugCode: string;
  quantity: number;
}

export interface AcceptedPrescriptionForOrder {
  prescriptionId: string;
  items: FulfillableItem[];
}

/**
 * File 12 Part 39.3 — `pharmacy-fulfillment`'s only way to read an
 * `ACCEPTED` prescription's fulfillable items when creating a
 * `PharmacyOrder`. Same shape as `GetAffiliationBillingInfoUseCase` (Part
 * 36.3): takes `tx` explicitly so the read participates in the caller's own
 * transaction, and does the minimum validation intrinsic to "is this
 * prescription valid to build an order from" — ownership and status — while
 * leaving order-specific rules (does it have any fulfillable items, does an
 * order already exist) to the caller, same division of responsibility that
 * use-case already established.
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
    if (prescription.status !== 'ACCEPTED') {
      throw new BusinessRuleError('PRESCRIPTION_NOT_ACCEPTED', 'This prescription has not been accepted by a pharmacist review yet.');
    }

    const items = await this.items.findByPrescriptionId(tx, prescriptionId);
    // Only drug_code-bearing items are fulfillable (File 12 Part 37.10: the
    // only items guaranteed to also carry a quantity) — a free-text-only
    // item with no assigned code has nothing a pharmacy order can price or
    // stock-check against.
    const fulfillable = items.filter((item): item is typeof item & { drug_code: string; quantity: number } => item.drug_code !== null && item.quantity !== null);

    return {
      prescriptionId: prescription.id,
      items: fulfillable.map((item) => ({ id: item.id, drugCode: item.drug_code, quantity: item.quantity })),
    };
  }
}
