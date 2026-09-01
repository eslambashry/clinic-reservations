import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertStatusIn } from '../domain/lab-order.rules';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { LabOrderItemRepository } from '../infrastructure/lab-order-item.repository';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';
import { LabResultRepository } from '../infrastructure/lab-result.repository';
import { TestCatalogRepository } from '../infrastructure/test-catalog.repository';

export interface RecordResultInput {
  itemId: string;
  fileLabel: string;
  sizeKb: number;
}

export interface RecordResultResult {
  labOrderId: string;
  status: string;
}

/**
 * `POST /lab-orders/{orderId}/results`, `LAB_STAFF` only. Per-item (DEC-006
 * resolved per-item, matching the dashboard's own `ItemResultState`): flips
 * the order to `RESULTS_READY` once every item is `RECORDED`, mirroring the
 * mock's `recordResult` exactly.
 */
@Injectable()
export class RecordResultUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(LabOrderItemRepository) private readonly labOrderItems: LabOrderItemRepository,
    @Inject(LabResultRepository) private readonly labResults: LabResultRepository,
    @Inject(TestCatalogRepository) private readonly testCatalog: TestCatalogRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, input: RecordResultInput, actor: AccessTokenPayload): Promise<RecordResultResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'This account has no active lab branch assignment.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== membership.contextId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }
      assertStatusIn(order.status, ['IN_ANALYSIS', 'RESULTS_READY'], 'LAB_ORDER_NOT_IN_ANALYSIS', 'Results can only be recorded during or after analysis.');

      const item = await this.labOrderItems.findById(tx, input.itemId);
      if (!item || item.lab_order_id !== labOrderId) {
        throw new NotFoundError('LabOrderItem', input.itemId);
      }
      if (item.result_state === 'RECORDED') {
        throw new ConflictError('LAB_ORDER_ITEM_RESULT_ALREADY_RECORDED', 'A result has already been recorded for this item.');
      }

      const fileLabel = input.fileLabel.trim() || this.defaultFileLabel(item.catalog_code, labOrderId);
      await this.labResults.create(tx, {
        labOrderId,
        itemId: item.id,
        fileLabel,
        sizeKb: Math.max(1, Math.round(input.sizeKb)),
        uploadedBy: actor.sub,
      });
      await this.labOrderItems.markRecorded(tx, item.id, item.version);

      const allItems = await this.labOrderItems.findByOrderId(tx, labOrderId);
      const allRecorded = allItems.every((i) => i.id === item.id || i.result_state === 'RECORDED');
      let status = order.status;
      if (allRecorded && order.status === 'IN_ANALYSIS') {
        await this.labOrders.setStatus(tx, labOrderId, order.version, 'RESULTS_READY');
        status = 'RESULTS_READY';
      }

      const catalog = await this.testCatalog.findByCodes(tx, [item.catalog_code]);
      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('RESULT_RECORDED'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: catalog[0]?.display_name ?? item.catalog_code,
      });

      return { labOrderId, status };
    });
  }

  private defaultFileLabel(catalogCode: string, labOrderId: string): string {
    return `${catalogCode}_${labOrderId.slice(-6).toUpperCase()}.pdf`;
  }
}
