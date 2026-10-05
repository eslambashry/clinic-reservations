import { Inject, Injectable } from '@nestjs/common';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { GetPrescriptionUseCase, PrescriptionDetail } from '../../prescriptions/application/get-prescription.use-case';
import { ReviewPrescriptionInput, ReviewPrescriptionResult, ReviewPrescriptionUseCase } from '../../prescriptions/application/review-prescription.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';
import { PharmacyOrderBroadcastRepository } from '../infrastructure/pharmacy-order-broadcast.repository';

/** PM-SEC-01 A: pharmacy staff access prescriptions only through their branch's orders. */
@Injectable()
export class OrderPrescriptionAccessUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly orders: PharmacyOrderRepository,
    @Inject(PharmacyOrderBroadcastRepository) private readonly broadcasts: PharmacyOrderBroadcastRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly memberships: GetActiveRoleMembershipUseCase,
    @Inject(GetPrescriptionUseCase) private readonly getPrescription: GetPrescriptionUseCase,
    @Inject(ReviewPrescriptionUseCase) private readonly reviewPrescription: ReviewPrescriptionUseCase,
  ) {}

  get(orderId: string, actor: AccessTokenPayload): Promise<PrescriptionDetail> {
    return this.prisma.$transaction(async (tx) => {
      const prescriptionId = await this.authorize(tx, orderId, actor);
      return this.getPrescription.executeForOrder(tx, prescriptionId);
    });
  }

  review(orderId: string, input: ReviewPrescriptionInput, actor: AccessTokenPayload): Promise<ReviewPrescriptionResult> {
    return this.prisma.$transaction(async (tx) => {
      const prescriptionId = await this.authorize(tx, orderId, actor);
      return this.reviewPrescription.executeInTransaction(tx, prescriptionId, input, actor);
    });
  }

  private async authorize(tx: Prisma.TransactionClient, orderId: string, actor: AccessTokenPayload): Promise<string> {
    if (actor.contextType !== 'PHARMACY_STAFF') throw new NotFoundError('PharmacyOrder', orderId);
    const membership = await this.memberships.executeByRoleMembershipId(actor.roleMembershipId, 'PHARMACY_STAFF');
    if (!membership?.contextId) throw new NotFoundError('PharmacyOrder', orderId);
    await this.orders.lockForPrescriptionAccess(tx, orderId);
    const order = await this.orders.findById(tx, orderId);
    if (!order) throw new NotFoundError('PharmacyOrder', orderId);
    if (order.pharmacy_branch_id === membership.contextId) return order.prescription_id;
    if (order.pharmacy_branch_id === null && order.status === 'RECEIVED') {
      const broadcast = await this.broadcasts.findByOrderAndBranch(tx, orderId, membership.contextId);
      if (broadcast && broadcast.response === null) return order.prescription_id;
    }
    throw new NotFoundError('PharmacyOrder', orderId);
  }
}
