import { Inject, Injectable } from '@nestjs/common';
import { PharmacyOrder, PharmacyOrderStatus } from '@prisma/client';
import { GetPrescriptionSummaryUseCase } from '../../prescriptions/application/get-prescription-summary.use-case';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { GetUserSummaryUseCase } from '../../identity-auth/application/get-user-summary.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ForbiddenError } from '../../../shared/core/errors/domain-errors';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ListOrdersCursor, PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';
import { buildPharmacyOrderDetail, PharmacyOrderDetail } from './pharmacy-order-detail.mapper';

export interface ListPharmacyOrdersInput {
  status?: PharmacyOrderStatus;
  sort?: 'createdAt:asc' | 'createdAt:desc';
  cursor?: string;
  limit?: number;
}

export interface ListPharmacyOrdersResult {
  orders: PharmacyOrderDetail[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * `GET /pharmacy-orders` (2026-08-29 addition — File 12 Part 39 item 11's
 * named-but-unbuilt queue listing). Role-aware, same "branch resolved
 * server-side, never a request parameter" convention as accept/decline/quote:
 * `PATIENT` sees only their own orders; `PHARMACY_STAFF` sees their branch's
 * queue — orders already claimed by it, plus orders currently broadcast to
 * it and not yet accepted/declined (`PharmacyOrderRepository.findForBranch`).
 * `ADMIN`/other contexts have no query for this and are rejected — matching
 * `GetPharmacyOrderUseCase`'s own "no Admin bypass" precedent for this
 * module (File 11 05.8 names only patient/assigned-staff).
 *
 * Each row is enriched to the same full shape `GetPharmacyOrderUseCase`
 * returns (`medsuper-pharmacy-dashboard`'s `MockPharmacyOrdersService`
 * returns the same rich object from both `listOrders` and `getOrder` — the
 * queue cards render patient/prescription/quote info directly, no per-row
 * detail fetch). This means one extra patient + prescription lookup per row
 * on every page — an accepted N+1 for an MVP staff console, not a
 * performance target; batch the two `IdentityAuthModule`/`PrescriptionsModule`
 * lookups if this queue ever needs to scale past a small per-branch page.
 */
@Injectable()
export class ListPharmacyOrdersUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetUserSummaryUseCase) private readonly getUserSummary: GetUserSummaryUseCase,
    @Inject(GetPrescriptionSummaryUseCase) private readonly getPrescriptionSummary: GetPrescriptionSummaryUseCase,
  ) {}

  async execute(input: ListPharmacyOrdersInput, actor: AccessTokenPayload): Promise<ListPharmacyOrdersResult> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const sortDirection = input.sort === 'createdAt:asc' ? 'asc' : 'desc';
    const cursor = decodeCursor<ListOrdersCursor>(input.cursor);
    const page = { cursor, limit: limit + 1, sortDirection, status: input.status } as const;

    let rows: PharmacyOrder[];
    if (actor.contextType === 'PATIENT') {
      rows = await this.pharmacyOrders.findForPatient(this.prisma, actor.sub, page);
    } else if (actor.contextType === 'PHARMACY_STAFF') {
      const membership = await this.getActiveRoleMembership.execute(actor.sub, 'PHARMACY_STAFF');
      if (!membership || !membership.contextId) {
        throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع صيدلية نشِط.');
      }
      rows = await this.pharmacyOrders.findForBranch(this.prisma, membership.contextId, page);
    } else {
      throw new ForbiddenError('FORBIDDEN', 'صلاحيات حسابك لا تسمح بعرض طلبات الصيدلية.');
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    const orders = await Promise.all(pageRows.map((order) => this.enrich(order)));

    return {
      orders,
      nextCursor: hasMore && last ? encodeCursor<ListOrdersCursor>({ createdAt: last.created_at.toISOString(), id: last.id }) : null,
    };
  }

  private async enrich(order: PharmacyOrder): Promise<PharmacyOrderDetail> {
    const [patient, prescription] = await Promise.all([
      this.getUserSummary.execute(this.prisma, order.patient_id),
      this.getPrescriptionSummary.execute(this.prisma, order.prescription_id),
    ]);
    // FK-guaranteed to exist — same "data corruption, not a legitimate gap" reasoning as GetPharmacyOrderUseCase.
    if (!patient || !prescription) {
      throw new Error(`PharmacyOrder ${order.id} references a missing patient or prescription.`);
    }

    let doctorName: string | null = null;
    if (prescription.doctorId) {
      const doctor = await this.getUserSummary.execute(this.prisma, prescription.doctorId);
      doctorName = doctor ? [doctor.firstName, doctor.lastName].filter(Boolean).join(' ') || null : null;
    }

    return buildPharmacyOrderDetail(order, patient, prescription, doctorName);
  }
}
