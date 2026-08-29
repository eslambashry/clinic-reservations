import { Inject, Injectable } from '@nestjs/common';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { SubstitutionRepository } from '../infrastructure/substitution.repository';
import { PharmacyOrderItemRepository } from '../infrastructure/pharmacy-order-item.repository';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export interface PharmacyOrderDetail {
  pharmacyOrderId: string;
  status: string;
  fulfillmentType: string;
  pharmacyBranchId: string | null;
  items: { id: string; prescriptionItemId: string; status: string; substitutedDrugCode: string | null; unitPrice: string | null; quantity: number }[];
  substitutions: {
    id: string;
    pharmacyOrderItemId: string;
    originalDrugCode: string;
    substitutedDrugCode: string;
    patientDecision: string;
  }[];
}

/**
 * File 11 05.8 `GET /v1/pharmacy-orders/{orderId}` — documented but not yet
 * built until this pass, needed for a patient to actually see a proposed
 * substitution before approving/rejecting it. `NotFoundError` for anyone
 * not entitled (hides existence), same pattern as `GetPrescriptionUseCase`.
 * No Admin bypass — File 11 05.8 names only "owning patient or the assigned
 * pharmacy branch staff", unlike prescriptions' equivalent endpoint.
 */
@Injectable()
export class GetPharmacyOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(PharmacyOrderItemRepository) private readonly pharmacyOrderItems: PharmacyOrderItemRepository,
    @Inject(SubstitutionRepository) private readonly substitutions: SubstitutionRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
  ) {}

  async execute(pharmacyOrderId: string, actor: AccessTokenPayload): Promise<PharmacyOrderDetail> {
    const order = await this.pharmacyOrders.findById(this.prisma, pharmacyOrderId);
    if (!order) {
      throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
    }

    const isOwner = order.patient_id === actor.sub;
    let isAssignedStaff = false;
    if (!isOwner && actor.contextType === 'PHARMACY_STAFF') {
      const membership = await this.getActiveRoleMembership.execute(actor.sub, 'PHARMACY_STAFF');
      isAssignedStaff = membership?.contextId !== null && membership?.contextId === order.pharmacy_branch_id;
    }
    if (!isOwner && !isAssignedStaff) {
      throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
    }

    const [items, substitutions] = await Promise.all([
      this.pharmacyOrderItems.findByOrderId(this.prisma, pharmacyOrderId),
      this.substitutions.findByOrderId(this.prisma, pharmacyOrderId),
    ]);

    return {
      pharmacyOrderId: order.id,
      status: order.status,
      fulfillmentType: order.fulfillment_type,
      pharmacyBranchId: order.pharmacy_branch_id,
      items: items.map((item) => ({
        id: item.id,
        prescriptionItemId: item.prescription_item_id,
        status: item.status,
        substitutedDrugCode: item.substituted_drug_code,
        unitPrice: item.unit_price?.toString() ?? null,
        quantity: item.quantity,
      })),
      substitutions: substitutions.map((substitution) => ({
        id: substitution.id,
        pharmacyOrderItemId: substitution.pharmacy_order_item_id,
        originalDrugCode: substitution.original_drug_code,
        substitutedDrugCode: substitution.substituted_drug_code,
        patientDecision: substitution.patient_decision,
      })),
    };
  }
}
