import { Inject, Injectable } from '@nestjs/common';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { ListAssistantUserIdsForBranchUseCase } from '../../provider-directory/application/list-assistant-user-ids-for-branch.use-case';
import { GetPharmacyHandoverAppointmentUseCase } from '../../scheduling-appointments/application/get-pharmacy-handover-appointment.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { assertOrderCanBeginFulfillment, nextStatusAfterFulfill } from '../domain/pharmacy-order.rules';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export interface FulfillPharmacyOrderResult {
  pharmacyOrderId: string;
  status: 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY';
}

/**
 * 2026-08-29 addition — `POST /pharmacy-orders/{orderId}/fulfill`,
 * `PHARMACY_STAFF` only. `PAID --> READY_FOR_PICKUP` (pickup) or
 * `PAID --> OUT_FOR_DELIVERY` (delivery), per File 11 Part 14's diagram.
 * Neither branch was reachable before this pass (Part 39.6: `OUT_FOR_DELIVERY`
 * was left unreachable pending Delivery, Phase 9 — this only changes the
 * *status flag*, not real courier assignment/tracking, which still doesn't
 * exist). No payment/pricing involved — this is a pure lifecycle transition.
 */
@Injectable()
export class FulfillPharmacyOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(ListAssistantUserIdsForBranchUseCase) private readonly listClinicAssistants: ListAssistantUserIdsForBranchUseCase,
    @Inject(GetPharmacyHandoverAppointmentUseCase) private readonly getHandoverAppointment: GetPharmacyHandoverAppointmentUseCase,
  ) {}

  async execute(pharmacyOrderId: string, actor: AccessTokenPayload): Promise<FulfillPharmacyOrderResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'PHARMACY_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع صيدلية نشِط.');
    }
    const branchId = membership.contextId;

    return this.prisma.$transaction(async (tx) => {
      const order = await this.pharmacyOrders.findById(tx, pharmacyOrderId);
      if (!order || order.pharmacy_branch_id !== branchId) {
        throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
      }
      assertOrderCanBeginFulfillment(order.status);

      const nextStatus = nextStatusAfterFulfill(order.fulfillment_type);
      await this.pharmacyOrders.setStatus(tx, pharmacyOrderId, order.version, nextStatus);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'pharmacy-fulfillment.pharmacy-order.fulfill',
        resourceType: 'pharmacy_order',
        resourceId: pharmacyOrderId,
      });

      let clinicAssistantIds: string[] = [];
      if (order.fulfillment_type === 'CLINIC_HANDOVER' && order.appointment_id && order.handover_clinic_branch_id) {
        const appointment = await this.getHandoverAppointment.execute(tx, order.appointment_id, order.patient_id);
        // Older or subsequently cancelled/rescheduled appointments must not
        // fan out to a guessed destination. The status transition still runs.
        if (['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'].includes(appointment.status) &&
            appointment.clinicBranchId === order.handover_clinic_branch_id) {
          clinicAssistantIds = await this.listClinicAssistants.execute(tx, appointment.clinicBranchId, appointment.doctorId);
        }
      }

      await this.outbox.emit(tx, 'ProviderPharmacyOrderStatusChanged', {
        pharmacyOrderId,
        status: nextStatus,
        fulfillmentType: order.fulfillment_type,
        recipientUserId: order.patient_id,
      });
      // A clinic assistant who created the order receives the clinic
      // handover event below. Do not also enqueue the same status change as
      // a generic provider notice for that same account.
      if (order.created_by_user_id && order.created_by_user_id !== order.patient_id && !clinicAssistantIds.includes(order.created_by_user_id)) {
        await this.outbox.emit(tx, 'ProviderPharmacyOrderStatusChanged', {
          pharmacyOrderId,
          status: nextStatus,
          fulfillmentType: order.fulfillment_type,
          recipientUserId: order.created_by_user_id,
        });
      }

      const staffRecipients = new Set(clinicAssistantIds);
      staffRecipients.delete(order.patient_id);
      for (const assistantUserId of staffRecipients) {
        await this.outbox.emit(tx, 'PharmacyOrderOnWayToClinicForStaff', {
          pharmacyOrderId,
          appointmentId: order.appointment_id!,
          clinicStaffUserId: assistantUserId,
        });
      }

      return { pharmacyOrderId, status: nextStatus as 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY' };
    });
  }
}
