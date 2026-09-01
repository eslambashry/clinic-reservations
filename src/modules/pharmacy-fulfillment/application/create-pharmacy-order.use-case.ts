import { Inject, Injectable } from '@nestjs/common';
import { FulfillmentType } from '@prisma/client';
import { GetAcceptedPrescriptionForOrderUseCase } from '../../prescriptions/application/get-accepted-prescription-for-order.use-case';
import { GetPharmacyBranchUseCase } from '../../provider-directory/application/get-pharmacy-branch.use-case';
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
  lat?: number;
  lng?: number;
  pharmacyBranchId?: string;
}

export interface CreatePharmacyOrderResult {
  pharmacyOrderId: string;
  status: string;
  broadcastedBranchIds: string[];
}

/**
 * File 11 Part 14 (`[*] --> RECEIVED`) / File 12 Part 39: creates a
 * `PharmacyOrder` from an `ACCEPTED` prescription and broadcasts it to
 * pharmacy branches.
 *
 * File 12 Part 44: if the caller already picked a specific branch
 * (`pharmacyBranchId`), that branch alone is broadcast to —
 * `accept`/`decline`/`quote` work exactly the same as the many-branch case,
 * just with a single candidate. Otherwise the order falls back to
 * broadcasting to the nearest verified branches found from `lat`/`lng`.
 *
 * Both `GetPharmacyBranchUseCase`/`SearchPharmacyBranchesUseCase` run BEFORE
 * the `$transaction` opens — same reasoning `UploadPrescriptionUseCase`
 * already uses for its quality-check/OCR calls: neither repository
 * participates in the write transaction anyway, and failing fast avoids
 * opening a transaction that's doomed to roll back.
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
    @Inject(GetPharmacyBranchUseCase) private readonly getPharmacyBranch: GetPharmacyBranchUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(input: CreatePharmacyOrderInput, actor: AccessTokenPayload): Promise<CreatePharmacyOrderResult> {
    let branchIds: string[];
    if (input.pharmacyBranchId) {
      branchIds = [await this.resolveChosenBranch(input.pharmacyBranchId, input.fulfillmentType)];
    } else {
      if (input.lat === undefined || input.lng === undefined) {
        throw new BusinessRuleError(
          'PHARMACY_ORDER_LOCATION_REQUIRED',
          'lat/lng are required when pharmacyBranchId is not provided.',
        );
      }
      branchIds = await this.findNearestBranches(input.lat, input.lng, input.fulfillmentType);
    }

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

  /** Validates the caller's chosen branch (exists, VERIFIED, delivery-capable if needed) and returns its id alone as the broadcast set. */
  private async resolveChosenBranch(branchId: string, fulfillmentType: FulfillmentType): Promise<string> {
    const branch = await this.getPharmacyBranch.execute(branchId, undefined);
    if (fulfillmentType === 'DELIVERY' && !branch.delivery_capable) {
      throw new BusinessRuleError('PHARMACY_BRANCH_NOT_DELIVERY_CAPABLE', 'The chosen pharmacy branch does not offer delivery.');
    }
    return branch.id;
  }

  private async findNearestBranches(lat: number, lng: number, fulfillmentType: FulfillmentType): Promise<string[]> {
    const branchResults = await this.searchPharmacyBranches.execute({
      lat,
      lng,
      radiusKm: PHARMACY_CONSTANTS.BROADCAST_RADIUS_KM,
      deliveryCapable: fulfillmentType === 'DELIVERY' ? true : undefined,
      limit: PHARMACY_CONSTANTS.BROADCAST_FANOUT_COUNT,
    });
    if (branchResults.items.length === 0) {
      throw new BusinessRuleError('NO_PHARMACY_BRANCHES_AVAILABLE', 'No verified pharmacy branches were found near the given location.');
    }
    return branchResults.items.map((branch) => branch.branchId);
  }
}
