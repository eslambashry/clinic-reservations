import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { ListStaffByContextUseCase } from '../../identity-auth/application/list-staff-by-context.use-case';
import { GetPrescriptionSummaryUseCase } from '../../prescriptions/application/get-prescription-summary.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { LabBranchRepository } from '../infrastructure/lab-branch.repository';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

export interface CreateLabOrderInput {
  labBranchId: string;
  collectionType: 'VISIT' | 'HOME_COLLECTION';
  /** Uploaded lab referral image/file reviewed by laboratory staff. */
  prescriptionId: string;
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
    @Inject(LabBranchRepository) private readonly labBranches: LabBranchRepository,
    @Inject(GetPrescriptionSummaryUseCase) private readonly getPrescriptionSummary: GetPrescriptionSummaryUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(ListStaffByContextUseCase) private readonly listStaffByContext: ListStaffByContextUseCase,
  ) {}

  async execute(input: CreateLabOrderInput, actor: AccessTokenPayload): Promise<CreateLabOrderResult> {
    const branch = await this.labBranches.findById(this.prisma, input.labBranchId);
    if (!branch) {
      throw new NotFoundError('LabBranch', input.labBranchId);
    }
    if (input.collectionType === 'HOME_COLLECTION' && !branch.home_collection_capable) {
      throw new BusinessRuleError('LAB_BRANCH_NOT_HOME_COLLECTION_CAPABLE', 'فرع المعمل المختار لا يوفّر سحب العيّنة من المنزل.');
    }

    const prescription = await this.getPrescriptionSummary.execute(this.prisma, input.prescriptionId);
    if (!prescription || prescription.patientId !== actor.sub) {
      throw new NotFoundError('Prescription', input.prescriptionId);
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.create(tx, {
        patientId: actor.sub,
        labBranchId: input.labBranchId,
        prescriptionId: input.prescriptionId,
        collectionType: input.collectionType,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('REQUEST_RECEIVED'),
        resourceType: 'lab_order',
        resourceId: order.id,
        subjectPatientId: actor.sub,
      });

      // One event per LAB_STAFF member at this branch — same
      // one-event-per-recipient fan-out `ConfirmAppointmentUseCase` uses for
      // assistants, so the dispatch pipeline needs no multi-recipient support.
      const labStaff = await this.listStaffByContext.execute({
        roleCode: 'LAB_STAFF',
        contextType: RoleContextType.LAB_STAFF,
        contextId: input.labBranchId,
      });
      for (const staff of labStaff) {
        await this.outbox.emit(tx, 'NewLabOrderForStaff', {
          labOrderId: order.id,
          labStaffUserId: staff.userId,
        });
      }

      return { labOrderId: order.id, status: 'REQUESTED' as const };
    });
  }
}
