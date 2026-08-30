import { Inject, Injectable } from '@nestjs/common';
import { GetPrescriptionSummaryUseCase } from '../../prescriptions/application/get-prescription-summary.use-case';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { GetUserSummaryUseCase } from '../../identity-auth/application/get-user-summary.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';
import { buildPharmacyOrderDetail, PharmacyOrderDetail } from './pharmacy-order-detail.mapper';

export type { PharmacyOrderDetail };

/**
 * File 11 05.8 `GET /v1/pharmacy-orders/{orderId}` — owning patient or the
 * assigned pharmacy branch staff. No Admin bypass (File 11 05.8 names only
 * those two). `NotFoundError` for anyone not entitled (hides existence).
 *
 * 2026-08-29 reshape: the response now matches
 * `medsuper-pharmacy-dashboard`'s `PharmacyOrder` type exactly (flat quote,
 * patient/prescription projections) instead of the original
 * items[]/substitutions[] shape, which stopped being meaningful once quoting
 * went flat (see `submit-pharmacy-order-quote.use-case.ts`). Mapping itself
 * lives in `pharmacy-order-detail.mapper.ts`, shared with
 * `ListPharmacyOrdersUseCase`.
 */
@Injectable()
export class GetPharmacyOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetUserSummaryUseCase) private readonly getUserSummary: GetUserSummaryUseCase,
    @Inject(GetPrescriptionSummaryUseCase) private readonly getPrescriptionSummary: GetPrescriptionSummaryUseCase,
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

    const [patient, prescription] = await Promise.all([
      this.getUserSummary.execute(this.prisma, order.patient_id),
      this.getPrescriptionSummary.execute(this.prisma, order.prescription_id),
    ]);
    if (!patient || !prescription) {
      // Both rows are FK-guaranteed to exist by the time an order exists — a
      // miss here means data corruption, not a legitimate 404 for the caller.
      throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
    }

    let doctorName: string | null = null;
    if (prescription.doctorId) {
      const doctor = await this.getUserSummary.execute(this.prisma, prescription.doctorId);
      doctorName = doctor ? [doctor.firstName, doctor.lastName].filter(Boolean).join(' ') || null : null;
    }

    return buildPharmacyOrderDetail(order, patient, prescription, doctorName);
  }
}
