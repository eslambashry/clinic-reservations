import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertCollectionGateSatisfied, assertStatus, collectionGateSatisfied, hasLiveSample } from '../domain/lab-order.rules';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { GetCustodyEventsUseCase } from './get-custody-events.use-case';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

export interface CollectSampleInput {
  note?: string;
}

export interface CollectSampleResult {
  labOrderId: string;
  status: 'AWAITING_SAMPLE';
}

/**
 * `POST /lab-orders/{orderId}/collect-sample`, `LAB_STAFF` only. Requires
 * the collection gate satisfied (arrival confirmed for `VISIT`, courier
 * dispatched for `HOME_COLLECTION`) and no already-live sample. Clears
 * `recollection_required` — mirrors the mock's `collectSample` exactly.
 */
@Injectable()
export class CollectSampleUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetCustodyEventsUseCase) private readonly getCustodyEvents: GetCustodyEventsUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, input: CollectSampleInput | undefined, actor: AccessTokenPayload): Promise<CollectSampleResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'This account has no active lab branch assignment.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== membership.contextId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }
      assertStatus(order.status, 'AWAITING_SAMPLE', 'LAB_ORDER_NOT_AWAITING_SAMPLE', 'Collection requires a confirmed booking awaiting sample.');

      const events = (await this.getCustodyEvents.executeForOrders(tx, [labOrderId])).get(labOrderId) ?? [];
      if (hasLiveSample(events)) {
        throw new ConflictError('LAB_ORDER_SAMPLE_ALREADY_COLLECTED', 'A sample has already been collected for this order.');
      }
      assertCollectionGateSatisfied(collectionGateSatisfied(events, order.collection_type));

      if (order.recollection_required) {
        await this.labOrders.setRecollectionRequired(tx, labOrderId, order.version, false);
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('SAMPLE_COLLECTED'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: input?.note?.trim() || undefined,
      });

      return { labOrderId, status: order.status as 'AWAITING_SAMPLE' };
    });
  }
}
