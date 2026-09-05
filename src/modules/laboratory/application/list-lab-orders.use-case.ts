import { Inject, Injectable } from '@nestjs/common';
import { LabOrder, LabOrderStatus } from '@prisma/client';
import { GetPrescriptionSummaryUseCase } from '../../prescriptions/application/get-prescription-summary.use-case';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { GetUserSummaryUseCase } from '../../identity-auth/application/get-user-summary.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { MEDIA_CONSTANTS } from '../../../shared/config/constants';
import { ForbiddenError } from '../../../shared/core/errors/domain-errors';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { MEDIA_STORAGE, MediaStoragePort } from '../../../shared/kernel/storage/media-storage.port';
import { GetCustodyEventsUseCase } from './get-custody-events.use-case';
import { buildLabOrderDetail, LabOrderDetail } from './lab-order-detail.mapper';
import { LabOrderItemRepository } from '../infrastructure/lab-order-item.repository';
import { LabOrderNoteRepository } from '../infrastructure/lab-order-note.repository';
import { ListOrdersCursor, LabOrderRepository } from '../infrastructure/lab-order.repository';
import { LabResultRepository } from '../infrastructure/lab-result.repository';
import { TestCatalogRepository } from '../infrastructure/test-catalog.repository';

export interface ListLabOrdersInput {
  status?: LabOrderStatus;
  sort?: 'createdAt:asc' | 'createdAt:desc';
  cursor?: string;
  limit?: number;
}

export interface ListLabOrdersResult {
  orders: LabOrderDetail[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * `GET /lab-orders` — the caller's own orders (`PATIENT`) or their branch's
 * full queue (`LAB_STAFF`). Simpler than `ListPharmacyOrdersUseCase`: a lab
 * order is assigned to exactly one branch at creation (`CreateLabOrderUseCase`),
 * never contested between branches, so there is no broadcast/"incoming
 * unanswered" subset to union in.
 */
@Injectable()
export class ListLabOrdersUseCase {
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
    @Inject(MEDIA_STORAGE) private readonly mediaStorage: MediaStoragePort,
  ) {}

  async execute(input: ListLabOrdersInput, actor: AccessTokenPayload): Promise<ListLabOrdersResult> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const sortDirection = input.sort === 'createdAt:asc' ? 'asc' : 'desc';
    const cursor = decodeCursor<ListOrdersCursor>(input.cursor);
    const page = { cursor, limit: limit + 1, sortDirection, status: input.status } as const;

    let rows: LabOrder[];
    if (actor.contextType === 'PATIENT') {
      rows = await this.labOrders.findForPatient(this.prisma, actor.sub, page);
    } else if (actor.contextType === 'LAB_STAFF') {
      const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
      if (!membership || !membership.contextId) {
        throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع معمل نشِط.');
      }
      rows = await this.labOrders.findForBranch(this.prisma, membership.contextId, page);
    } else {
      throw new ForbiddenError('FORBIDDEN', 'صلاحيات حسابك لا تسمح بعرض طلبات التحاليل.');
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    const orders = await this.enrichAll(pageRows);

    return {
      orders,
      nextCursor: hasMore && last ? encodeCursor<ListOrdersCursor>({ createdAt: last.created_at.toISOString(), id: last.id }) : null,
    };
  }

  /**
   * Batched enrichment: one custody-events read for the whole page
   * (`GetCustodyEventsUseCase`), but patient/prescription/catalog lookups
   * remain per-row — an accepted N+1 for an MVP staff console, same
   * "not a performance target" tradeoff `ListPharmacyOrdersUseCase` already
   * documents.
   */
  private async enrichAll(rows: LabOrder[]): Promise<LabOrderDetail[]> {
    const custodyByOrder = await this.getCustodyEvents.executeForOrders(this.prisma, rows.map((r) => r.id));

    return Promise.all(
      rows.map(async (order) => {
        const [patient, prescription, items, results, notes] = await Promise.all([
          this.getUserSummary.execute(this.prisma, order.patient_id),
          order.prescription_id ? this.getPrescriptionSummary.execute(this.prisma, order.prescription_id) : Promise.resolve(null),
          this.labOrderItems.findByOrderId(this.prisma, order.id),
          this.labResults.findByOrderId(this.prisma, order.id),
          this.labOrderNotes.findByOrderId(this.prisma, order.id),
        ]);
        if (!patient) {
          throw new Error(`LabOrder ${order.id} references a missing patient.`);
        }

        const catalog = await this.testCatalog.findByCodes(this.prisma, items.map((i) => i.catalog_code));
        const catalogNameByCode = new Map(catalog.map((c) => [c.code, c.display_name]));

        const noteAuthorIds = [...new Set(notes.map((n) => n.author_id))];
        const authorSummaries = await Promise.all(noteAuthorIds.map((id) => this.getUserSummary.execute(this.prisma, id)));
        const authorNameById = new Map(
          authorSummaries.filter((s): s is NonNullable<typeof s> => s !== null).map((s) => [s.id, [s.firstName, s.lastName].filter(Boolean).join(' ') || 'موظف']),
        );
        const noteDetails = notes.map((n) => ({ id: n.id, at: n.created_at.toISOString(), author: authorNameById.get(n.author_id) ?? 'موظف', body: n.body }));

        const signedResults = results.map((r) =>
          r.file_url ? { ...r, file_url: this.mediaStorage.getSignedUrl(r.file_url, MEDIA_CONSTANTS.SIGNED_URL_TTL_SECONDS) } : r,
        );

        return buildLabOrderDetail(order, patient, prescription, items, catalogNameByCode, signedResults, custodyByOrder.get(order.id) ?? [], noteDetails);
      }),
    );
  }
}
