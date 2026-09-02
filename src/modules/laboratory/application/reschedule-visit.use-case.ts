import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertFutureInstant, assertStatusIn, hasLiveSample } from '../domain/lab-order.rules';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { GetCustodyEventsUseCase } from './get-custody-events.use-case';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

export interface RescheduleVisitInput {
  appointmentAt: string;
  reason?: string;
}

export interface RescheduleVisitResult {
  labOrderId: string;
  status: string;
}

/**
 * `POST /lab-orders/{orderId}/reschedule`, `LAB_STAFF` only — SPECULATIVE
 * addition the dashboard itself added 2026-08-28 (`docs/PROPOSED_CONTRACT.md`
 * §4 there): moves the appointment before a sample exists. `QUOTED`/
 * `AWAITING_SAMPLE` only, and only while no live sample exists yet — once
 * collected, the appointment is history; reject/recollect instead.
 */
@Injectable()
export class RescheduleVisitUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetCustodyEventsUseCase) private readonly getCustodyEvents: GetCustodyEventsUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, input: RescheduleVisitInput, actor: AccessTokenPayload): Promise<RescheduleVisitResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'This account has no active lab branch assignment.');
    }
    assertFutureInstant(input.appointmentAt, 'VALIDATION_ERROR', 'Appointment must be a valid instant in the future.');

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== membership.contextId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }
      assertStatusIn(order.status, ['QUOTED', 'AWAITING_SAMPLE'], 'LAB_ORDER_NOT_RESCHEDULABLE', 'Reschedule requires QUOTED or AWAITING_SAMPLE.');
      if (!order.appointment_at) {
        throw new BusinessRuleError('LAB_ORDER_NO_QUOTE_TO_RESCHEDULE', 'This order has no quoted appointment to reschedule.');
      }

      const events = (await this.getCustodyEvents.executeForOrders(tx, [labOrderId])).get(labOrderId) ?? [];
      if (hasLiveSample(events)) {
        throw new ConflictError('LAB_ORDER_SAMPLE_ALREADY_LIVE', 'A collected sample already anchors this visit.');
      }

      await this.labOrders.rescheduleAppointment(tx, labOrderId, order.version, new Date(input.appointmentAt));

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('VISIT_RESCHEDULED'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: input.reason?.trim() || undefined,
      });

      return { labOrderId, status: order.status };
    });
  }
}
