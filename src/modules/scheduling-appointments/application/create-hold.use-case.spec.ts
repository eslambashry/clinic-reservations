import { Prisma } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreateHoldUseCase } from './create-hold.use-case';

function buildTx() {
  return {} as any;
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('unique violation', { code: 'P2002', clientVersion: '5.22.0' });
}

describe('CreateHoldUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const input = { doctorClinicAffiliationId: 'aff-1', slotId: 'slot-1', patientId: 'patient-1' };
  const slot = { id: 'slot-1', doctor_clinic_affiliation_id: 'aff-1', status: 'OPEN' };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const slots = { findById: jest.fn(), markHeld: jest.fn() };
    const holds = { create: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new CreateHoldUseCase(prisma as any, slots as any, holds as any, audit as any, outbox as any);
    return { tx, prisma, slots, holds, audit, outbox, useCase };
  }

  it('rejects a patientId that is not the caller, before touching the database', async () => {
    const { prisma, useCase } = setup();

    await expect(useCase.execute({ ...input, patientId: 'someone-else' }, actor)).rejects.toBeInstanceOf(ForbiddenError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s when the slot does not exist or belongs to a different affiliation', async () => {
    const { slots, useCase } = setup();
    slots.findById.mockResolvedValue(null);

    await expect(useCase.execute(input, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when the slot belongs to a different affiliation than the one supplied', async () => {
    const { slots, useCase } = setup();
    slots.findById.mockResolvedValue({ ...slot, doctor_clinic_affiliation_id: 'other-aff' });

    await expect(useCase.execute(input, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('409s with SLOT_ALREADY_BOOKED when the slot is no longer OPEN', async () => {
    const { slots, useCase } = setup();
    slots.findById.mockResolvedValue(slot);
    slots.markHeld.mockResolvedValue(false);

    await expect(useCase.execute(input, actor)).rejects.toMatchObject({ code: 'SLOT_ALREADY_BOOKED', httpStatus: 409 });
  });

  it('409s with SLOT_ALREADY_HELD when the hold insert violates the partial unique index', async () => {
    const { slots, holds, useCase } = setup();
    slots.findById.mockResolvedValue(slot);
    slots.markHeld.mockResolvedValue(true);
    holds.create.mockRejectedValue(uniqueViolation());

    await expect(useCase.execute(input, actor)).rejects.toMatchObject({ code: 'SLOT_ALREADY_HELD', httpStatus: 409 });
  });

  it('creates the hold, audits it, and emits AppointmentHeld in the same transaction', async () => {
    const { tx, slots, holds, audit, outbox, useCase } = setup();
    slots.findById.mockResolvedValue(slot);
    slots.markHeld.mockResolvedValue(true);
    holds.create.mockResolvedValue({ id: 'hold-1' });

    const result = await useCase.execute(input, actor);

    expect(result.holdId).toBe('hold-1');
    expect(result.slotId).toBe('slot-1');
    expect(result.status).toBe('HELD');
    expect(slots.markHeld).toHaveBeenCalledWith(tx, 'slot-1');
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ actorUserId: 'patient-1', action: 'scheduling_appointments.appointment_hold.create', resourceId: 'hold-1' }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'AppointmentHeld', expect.objectContaining({ holdId: 'hold-1', slotId: 'slot-1' }));
  });
});
