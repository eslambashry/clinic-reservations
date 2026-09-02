import { Inject, Injectable } from '@nestjs/common';
import { GetPrescriptionSummaryUseCase } from '../../prescriptions/application/get-prescription-summary.use-case';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { GetUserSummaryUseCase } from '../../identity-auth/application/get-user-summary.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { GetCustodyEventsUseCase } from './get-custody-events.use-case';
import { buildLabOrderDetail, LabOrderDetail, NoteDetail } from './lab-order-detail.mapper';
import { LabOrderItemRepository } from '../infrastructure/lab-order-item.repository';
import { LabOrderNoteRepository } from '../infrastructure/lab-order-note.repository';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';
import { LabResultRepository } from '../infrastructure/lab-result.repository';
import { TestCatalogRepository } from '../infrastructure/test-catalog.repository';

export type { LabOrderDetail };

/**
 * `GET /lab-orders/{orderId}` — owning patient or the assigned lab branch
 * staff. No Admin bypass, mirrors `GetPharmacyOrderUseCase`'s own precedent.
 * `NotFoundError` for anyone not entitled (hides existence).
 */
@Injectable()
export class GetLabOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(LabOrderItemRepository) private readonly labOrderItems: LabOrderItemRepository,
    @Inject(LabResultRepository) private readonly labResults: LabResultRepository,
    @Inject(LabOrderNoteRepository) private readonly labOrderNotes: LabOrderNoteRepository,
    @Inject(TestCatalogRepository) private readonly testCatalog: TestCatalogRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetUserSummaryUseCase) private readonly getUserSummary: GetUserSummaryUseCase,
    @Inject(GetPrescriptionSummaryUseCase) private readonly getPrescriptionSummary: GetPrescriptionSummaryUseCase,
    @Inject(GetCustodyEventsUseCase) private readonly getCustodyEvents: GetCustodyEventsUseCase,
  ) {}

  async execute(labOrderId: string, actor: AccessTokenPayload): Promise<LabOrderDetail> {
    const order = await this.labOrders.findById(this.prisma, labOrderId);
    if (!order) {
      throw new NotFoundError('LabOrder', labOrderId);
    }

    const isOwner = order.patient_id === actor.sub;
    let isAssignedStaff = false;
    if (!isOwner && actor.contextType === 'LAB_STAFF') {
      const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
      isAssignedStaff = membership?.contextId !== null && membership?.contextId === order.lab_branch_id;
    }
    if (!isOwner && !isAssignedStaff) {
      throw new NotFoundError('LabOrder', labOrderId);
    }

    const [patient, prescription, items, results, notes, custodyByOrder] = await Promise.all([
      this.getUserSummary.execute(this.prisma, order.patient_id),
      order.prescription_id ? this.getPrescriptionSummary.execute(this.prisma, order.prescription_id) : Promise.resolve(null),
      this.labOrderItems.findByOrderId(this.prisma, order.id),
      this.labResults.findByOrderId(this.prisma, order.id),
      this.labOrderNotes.findByOrderId(this.prisma, order.id),
      this.getCustodyEvents.executeForOrders(this.prisma, [order.id]),
    ]);
    if (!patient) {
      // FK-guaranteed to exist — a miss here means data corruption, not a legitimate 404.
      throw new NotFoundError('LabOrder', labOrderId);
    }

    const catalog = await this.testCatalog.findByCodes(this.prisma, items.map((i) => i.catalog_code));
    const catalogNameByCode = new Map(catalog.map((c) => [c.code, c.display_name]));

    const noteAuthorIds = [...new Set(notes.map((n) => n.author_id))];
    const authorSummaries = await Promise.all(noteAuthorIds.map((id) => this.getUserSummary.execute(this.prisma, id)));
    const authorNameById = new Map(
      authorSummaries.filter((s): s is NonNullable<typeof s> => s !== null).map((s) => [s.id, [s.firstName, s.lastName].filter(Boolean).join(' ') || 'موظف']),
    );
    const noteDetails: NoteDetail[] = notes.map((n) => ({
      id: n.id,
      at: n.created_at.toISOString(),
      author: authorNameById.get(n.author_id) ?? 'موظف',
      body: n.body,
    }));

    return buildLabOrderDetail(order, patient, prescription, items, catalogNameByCode, results, custodyByOrder.get(order.id) ?? [], noteDetails);
  }
}
