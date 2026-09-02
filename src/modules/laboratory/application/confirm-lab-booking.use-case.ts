import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertStatus } from '../domain/lab-order.rules';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

export interface ConfirmLabBookingResult {
  labOrderId: string;
  status: 'AWAITING_SAMPLE';
  bookingCode: string;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids phone/reception mis-reads

function generateBookingCode(): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `LB-${code}`;
}

/**
 * `POST /lab-orders/{orderId}/confirm-booking`, `LAB_STAFF` only —
 * `QUOTED --> AWAITING_SAMPLE`, added 2026-09-02 (File 12 Part 47).
 *
 * The dashboard's own contract already declares `BOOKING_CONFIRMED` as a
 * `CustodyEventType` and `bookingCode` as a `LabOrder` field, but no method
 * anywhere in `LaboratoryOrdersService`/`MockLaboratoryOrdersService`
 * produces either — `submitQuote` moves `REQUESTED --> QUOTED`, and every
 * downstream method (`recordArrival`/`dispatchCourier`/`collectSample`)
 * requires `AWAITING_SAMPLE` already, so a quoted order could never actually
 * progress. Real reception staff commonly take a phone/walk-in booking on
 * the patient's behalf (the existing `bookingCode`/`queueNumber` design —
 * "reception can match walk-ins" — already assumes this), so this closes the
 * gap as a staff action rather than waiting on a patient-facing Flutter
 * booking flow (`lab_booking` is BLOCKED, MEMORY.md).
 */
@Injectable()
export class ConfirmLabBookingUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, actor: AccessTokenPayload): Promise<ConfirmLabBookingResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'This account has no active lab branch assignment.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== membership.contextId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }
      assertStatus(order.status, 'QUOTED', 'LAB_ORDER_NOT_QUOTED', 'Booking confirmation requires a sent quote awaiting the patient.');

      const bookingCode = generateBookingCode();
      await this.labOrders.confirmBooking(tx, labOrderId, order.version, bookingCode);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('BOOKING_CONFIRMED'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: bookingCode,
      });

      return { labOrderId, status: 'AWAITING_SAMPLE' as const, bookingCode };
    });
  }
}
