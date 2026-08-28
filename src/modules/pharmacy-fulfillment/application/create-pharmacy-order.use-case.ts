import { Inject, Injectable } from '@nestjs/common';
import { FulfillmentType } from '@prisma/client';
import { GetAcceptedPrescriptionForOrderUseCase } from '../../prescriptions/application/get-accepted-prescription-for-order.use-case';
import { SearchPharmacyBranchesUseCase } from '../../provider-directory/application/search-pharmacy-branches.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { PHARMACY_CONSTANTS } from '../../../shared/config/constants';
import { BusinessRuleError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertHasFulfillableItems, assertNoActiveOrderExists } from '../domain/pharmacy-order.rules';
import { PharmacyOrderBroadcastRepository } from '../infrastructure/pharmacy-order-broadcast.repository';
import { PharmacyOrderItemRepository } from '../infrastructure/pharmacy-order-item.repository';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export interface CreatePharmacyOrderInput {
  prescriptionId: string;
  fulfillmentType: FulfillmentType;
  lat: number;
  lng: number;
}

export interface CreatePharmacyOrderResult {
  pharmacyOrderId: string;
  status: string;
  broadcastedBranchIds: string[];
}

/**
 * File 11 Part 14 (`[*] --> RECEIVED`) / File 12 Part 39: creates a
 * `PharmacyOrder` from an `ACCEPTED` prescription and broadcasts it to the
 * nearest verified pharmacy branches.
 *
 * `SearchPharmacyBranchesUseCase` (Part 38) runs BEFORE the `$transaction`
 * opens — same reasoning `UploadPrescriptionUseCase` already uses for its
 * quality-check/OCR calls: its repository takes `PrismaService`, not a
 * `tx`, so it can't participate in the write transaction anyway, and
 * failing fast on "no branches nearby" avoids opening a transaction that's
 * doomed to roll back.
 */
@Injectable()
export class CreatePharmacyOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(PharmacyOrderItemRepository) private readonly pharmacyOrderItems: PharmacyOrderItemRepository,
    @Inject(PharmacyOrderBroadcastRepository) private readonly broadcasts: PharmacyOrderBroadcastRepository,
    @Inject(GetAcceptedPrescriptionForOrderUseCase) private readonly getAcceptedPrescription: GetAcceptedPrescriptionForOrderUseCase,
    @Inject(SearchPharmacyBranchesUseCase) private readonly searchPharmacyBranches: SearchPharmacyBranchesUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(input: CreatePharmacyOrderInput, actor: AccessTokenPayload): Promise<CreatePharmacyOrderResult> {
    const branchResults = await this.searchPharmacyBranches.execute({
      lat: input.lat,
      lng: input.lng,
      radiusKm: PHARMACY_CONSTANTS.BROADCAST_RADIUS_KM,
      deliveryCapable: input.fulfillmentType === 'DELIVERY' ? true : undefined,
      limit: PHARMACY_CONSTANTS.BROADCAST_FANOUT_COUNT,
    });
    if (branchResults.items.length === 0) {
      throw new BusinessRuleError('NO_PHARMACY_BRANCHES_AVAILABLE', 'No verified pharmacy branches were found near the given location.');
    }
    const branchIds = branchResults.items.map((branch) => branch.branchId);

    return this.prisma.$transaction(async (tx) => {
      const latestOrder = await this.pharmacyOrders.findLatestByPrescriptionId(tx, input.prescriptionId);
      assertNoActiveOrderExists(latestOrder);

      const prescription = await this.getAcceptedPrescription.execute(tx, input.prescriptionId, actor.sub);
      assertHasFulfillableItems(prescription.items);

      const order = await this.pharmacyOrders.create(tx, {
        prescriptionId: input.prescriptionId,
        patientId: actor.sub,
        fulfillmentType: input.fulfillmentType,
      });

      await this.pharmacyOrderItems.createMany(
        tx,
        order.id,
        prescription.items.map((item) => ({ prescriptionItemId: item.id, quantity: item.quantity })),
      );
      await this.broadcasts.createMany(tx, order.id, branchIds);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'pharmacy-fulfillment.pharmacy-order.create',
        resourceType: 'pharmacy_order',
        resourceId: order.id,
      });

      await this.outbox.emit(tx, 'PharmacyOrderCreated', {
        pharmacyOrderId: order.id,
        prescriptionId: input.prescriptionId,
        patientId: actor.sub,
        broadcastBranchIds: branchIds,
      });

      return { pharmacyOrderId: order.id, status: order.status, broadcastedBranchIds: branchIds };
    });
  }
}
