import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, DomainError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { holdExpiresAt } from '../domain/appointment-lifecycle.rules';
import { AppointmentHoldRepository } from '../infrastructure/appointment-hold.repository';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';

export interface CreateHoldInput {
  doctorClinicAffiliationId: string;
  slotId: string;
  patientId: string;
}

export interface CreateHoldResult {
  holdId: string;
  slotId: string;
  expiresAt: Date;
  status: 'HELD';
}

/**
 * File 10 §2.3 `POST /v1/appointments/hold` / File 12 Part 35: single
 * transaction — verify the slot belongs to the given affiliation and is
 * `OPEN`, claim it (`OPEN→HELD`), insert the hold. Both the slot-side
 * conditional update and the DB partial unique index (Part 35.2/35.3) guard
 * against a double hold; this use-case reacts to whichever one loses.
 */
@Injectable()
export class CreateHoldUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: AppointmentSlotRepository,
    private readonly holds: AppointmentHoldRepository,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(input: CreateHoldInput, actor: AccessTokenPayload): Promise<CreateHoldResult> {
    if (input.patientId !== actor.sub) {
      throw new ForbiddenError('RESOURCE_NOT_OWNED', 'patientId must be the authenticated user (File 10 §2.3 — MVP: no dependents).');
    }

    return this.prisma.$transaction(async (tx) => {
      const slot = await this.slots.findById(tx, input.slotId);
      if (!slot || slot.doctor_clinic_affiliation_id !== input.doctorClinicAffiliationId) {
        throw new NotFoundError('AppointmentSlot', input.slotId);
      }

      const claimed = await this.slots.markHeld(tx, slot.id);
      if (!claimed) {
        throw new ConflictError('SLOT_ALREADY_BOOKED', 'This slot is no longer open.', { slotId: slot.id });
      }

      const expiresAt = holdExpiresAt(new Date());
      const hold = await this.holds.create(tx, { slotId: slot.id, patientId: actor.sub, expiresAt }).catch((error: unknown) => {
        throw translateCreateHoldError(error, slot.id);
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.appointment_hold.create',
        resourceType: 'appointment_hold',
        resourceId: hold.id,
      });

      await this.outbox.emit(tx, 'AppointmentHeld', {
        holdId: hold.id,
        slotId: slot.id,
        patientId: actor.sub,
        expiresAt: expiresAt.toISOString(),
      });

      return { holdId: hold.id, slotId: slot.id, expiresAt, status: 'HELD' as const };
    });
  }
}

/** File 10 §3.5.1: the partial unique index violation (P2002) is the documented `409 SLOT_ALREADY_HELD` path, not a 500. */
export function translateCreateHoldError(error: unknown, slotId: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictError('SLOT_ALREADY_HELD', 'This slot already has an active hold.', { slotId });
  }
  return new DomainError(500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unexpected error while creating the hold.');
}
