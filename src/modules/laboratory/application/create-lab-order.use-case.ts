import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { LabBranchRepository } from '../infrastructure/lab-branch.repository';
import { LabOrderItemRepository } from '../infrastructure/lab-order-item.repository';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';
import { TestCatalogRepository } from '../infrastructure/test-catalog.repository';

export interface CreateLabOrderInput {
  labBranchId: string;
  collectionType: 'VISIT' | 'HOME_COLLECTION';
  /** Direct catalog-test selection — creates a `LabOrderItem` per code. */
  testCodes?: string[];
  /**
   * Uploaded referral image/file instead of (or alongside) direct selection.
   * Unlike pharmacy's prescription (a drug-safety document that must be
   * transcribed into exact catalog items before it can be priced), this
   * image is purely informational — it tells lab staff which analysis to
   * run, and staff price the order after reading it, with no requirement to
   * register catalog items first (File 12 Part 50; supersedes the earlier
   * "incomplete request awaiting transcription" design in Readiness Plan
   * §E, which wrongly mirrored the pharmacy flow).
   */
  prescriptionId?: string;
}

export interface CreateLabOrderResult {
  labOrderId: string;
  status: 'REQUESTED';
}

/**
 * `POST /lab-orders`, `PATIENT`-role. Mirrors `CreatePharmacyOrderUseCase`
 * but simpler: a lab order is assigned to exactly one, caller-chosen branch
 * directly — there is no broadcast/first-accept-wins step to fan out to
 * (the dashboard's own `LabOrder.branchId` is a single field, never a
 * broadcast list).
 */
@Injectable()
export class CreateLabOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(LabOrderItemRepository) private readonly labOrderItems: LabOrderItemRepository,
    @Inject(LabBranchRepository) private readonly labBranches: LabBranchRepository,
    @Inject(TestCatalogRepository) private readonly testCatalog: TestCatalogRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(input: CreateLabOrderInput, actor: AccessTokenPayload): Promise<CreateLabOrderResult> {
    const testCodes = input.testCodes ?? [];
    if (testCodes.length === 0 && !input.prescriptionId) {
      throw new BusinessRuleError('LAB_ORDER_NEEDS_TESTS_OR_PRESCRIPTION', 'اختر تحليلاً واحدًا على الأقل أو أرفق روشتة.');
    }

    const branch = await this.labBranches.findById(this.prisma, input.labBranchId);
    if (!branch) {
      throw new NotFoundError('LabBranch', input.labBranchId);
    }
    if (input.collectionType === 'HOME_COLLECTION' && !branch.home_collection_capable) {
      throw new BusinessRuleError('LAB_BRANCH_NOT_HOME_COLLECTION_CAPABLE', 'فرع المعمل المختار لا يوفّر سحب العيّنة من المنزل.');
    }

    if (testCodes.length > 0) {
      const found = await this.testCatalog.findAllCodes(this.prisma, testCodes);
      const missing = testCodes.filter((code) => !found.includes(code));
      if (missing.length > 0) {
        throw new BusinessRuleError('UNKNOWN_TEST_CODE', `يوجد تحليل غير معروف ضمن الطلب: ${missing.join('، ')}`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.create(tx, {
        patientId: actor.sub,
        labBranchId: input.labBranchId,
        prescriptionId: input.prescriptionId,
        collectionType: input.collectionType,
      });

      if (testCodes.length > 0) {
        await this.labOrderItems.createMany(
          tx,
          order.id,
          testCodes.map((code) => ({ catalogCode: code })),
        );
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('REQUEST_RECEIVED'),
        resourceType: 'lab_order',
        resourceId: order.id,
        subjectPatientId: actor.sub,
      });

      return { labOrderId: order.id, status: 'REQUESTED' as const };
    });
  }
}
