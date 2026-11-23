import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { ConfirmAppointmentUseCase } from './confirm-appointment.use-case';

function buildTx() {
  return {} as any;
}

describe('ConfirmAppointmentUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const hold = { id: 'hold-1', slot_id: 'slot-1', patient_id: 'patient-1', version: 1, service_fee: { toString: () => '12.00' } };
  const slot = { id: 'slot-1', doctor_clinic_affiliation_id: 'aff-1' };
  const billing = { consultFee: '200.00', currency: 'EGP', doctorId: 'doctor-1', doctorUserId: 'doctor-user-1', clinicBranchId: 'branch-1' };
  const wallet = { paymentMethod: 'INTERNAL_WALLET' as const };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const holds = { findById: jest.fn(), markConverted: jest.fn() };
    const slots = { findById: jest.fn(), markBooked: jest.fn() };
    const appointments = { create: jest.fn() };
    const affiliationBilling = { execute: jest.fn() };
    const walletCapture = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const assistantUserIds = { execute: jest.fn().mockResolvedValue([]) };
    const serviceFeeReader = { get: jest.fn().mockResolvedValue({ amount: '15.00', currency: 'EGP' }) };
    const useCase = new ConfirmAppointmentUseCase(
      prisma as any,
      holds as any,
      slots as any,
      appointments as any,
      affiliationBilling as any,
      walletCapture as any,
      audit as any,
      outbox as any,
      assistantUserIds as any,
      serviceFeeReader as any,
    );
    return { tx, prisma, holds, slots, appointments, affiliationBilling, walletCapture, audit, outbox, assistantUserIds, serviceFeeReader, useCase };
  }

  function arrange(holdRow: any = hold) {
    const s = setup();
    s.holds.findById.mockResolvedValue(holdRow);
    s.holds.markConverted.mockResolvedValue(undefined);
    s.slots.findById.mockResolvedValue(slot);
    s.slots.markBooked.mockResolvedValue(true);
    s.affiliationBilling.execute.mockResolvedValue(billing);
    s.walletCapture.execute.mockResolvedValue({ paymentIntentId: 'intent-1', newWalletBalance: '88.00' });
    s.appointments.create.mockResolvedValue({ id: 'appointment-1' });
    return s;
  }

  it('rejects ONLINE payment (card goes through /payments), before touching the database', async () => {
    const { prisma, useCase } = setup();

    await expect(useCase.execute('hold-1', { paymentMethod: 'ONLINE' }, actor)).rejects.toMatchObject({ code: 'PAYMENT_METHOD_NOT_SUPPORTED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects PAY_AT_CLINIC (disabled), before touching the database', async () => {
    const { prisma, useCase } = setup();

    await expect(useCase.execute('hold-1', { paymentMethod: 'PAY_AT_CLINIC' } as any, actor)).rejects.toMatchObject({ code: 'PAYMENT_METHOD_NOT_SUPPORTED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s when the hold does not exist or belongs to a different patient', async () => {
    const { holds, useCase } = setup();
    holds.findById.mockResolvedValue(null);

    await expect(useCase.execute('hold-1', wallet, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('translates an expired/already-converted hold into 410 HOLD_EXPIRED', async () => {
    const { holds, useCase } = setup();
    holds.findById.mockResolvedValue(hold);
    holds.markConverted.mockRejectedValue(new OptimisticLockError('hold-1', 1));

    await expect(useCase.execute('hold-1', wallet, actor)).rejects.toMatchObject({ code: 'HOLD_EXPIRED', httpStatus: 410 });
  });

  it('debits exactly the service fee snapshotted on the hold (not the consult fee), confirms, audits and emits in the same transaction', async () => {
    const { tx, slots, appointments, affiliationBilling, walletCapture, audit, outbox, serviceFeeReader, useCase } = arrange();

    const result = await useCase.execute('hold-1', wallet, actor);

    expect(result).toEqual({ appointmentId: 'appointment-1', status: 'CONFIRMED' });
    expect(slots.markBooked).toHaveBeenCalled();
    expect(affiliationBilling.execute).toHaveBeenCalledWith(tx, 'aff-1');
    expect(serviceFeeReader.get).not.toHaveBeenCalled();

    const captureCall = walletCapture.execute.mock.calls[0];
    expect(captureCall[0]).toBe(tx);
    expect(captureCall[1]).toMatchObject({
      payerUserId: 'patient-1',
      payableType: 'APPOINTMENT',
      amount: '12.00',
      currency: 'EGP',
      idempotencyKey: 'hold:hold-1',
    });
    const generatedAppointmentId = captureCall[1].payableId;
    expect(typeof generatedAppointmentId).toBe('string');

    expect(appointments.create).toHaveBeenCalledWith(tx, {
      id: generatedAppointmentId,
      slotId: 'slot-1',
      patientId: 'patient-1',
      doctorClinicAffiliationId: 'aff-1',
      rescheduledFromAppointmentId: undefined,
      paymentIntentId: 'intent-1',
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ actorUserId: 'patient-1', action: 'scheduling_appointments.appointment.confirm', resourceId: 'appointment-1' }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'AppointmentConfirmed', expect.objectContaining({ appointmentId: 'appointment-1' }));
    expect(outbox.emit).toHaveBeenCalledWith(
      tx,
      'NewAppointmentBookedForDoctor',
      expect.objectContaining({ appointmentId: 'appointment-1', doctorUserId: 'doctor-user-1' }),
    );
  });

  it('falls back to the current SERVICE_FEE policy for a legacy hold without a fee snapshot', async () => {
    const { tx, walletCapture, serviceFeeReader, useCase } = arrange({ ...hold, service_fee: null });

    await useCase.execute('hold-1', wallet, actor);

    expect(serviceFeeReader.get).toHaveBeenCalledWith(tx);
    expect(walletCapture.execute).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: '15.00' }));
  });

  it('notifies every assistant assigned to the appointment branch, scoped to that branch only', async () => {
    const { tx, outbox, assistantUserIds, useCase } = arrange();
    assistantUserIds.execute.mockResolvedValue(['assistant-1', 'assistant-2']);

    await useCase.execute('hold-1', wallet, actor);

    expect(assistantUserIds.execute).toHaveBeenCalledWith(tx, 'branch-1');
    expect(outbox.emit).toHaveBeenCalledWith(
      tx,
      'NewAppointmentBookedForAssistant',
      expect.objectContaining({ appointmentId: 'appointment-1', assistantUserId: 'assistant-1' }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(
      tx,
      'NewAppointmentBookedForAssistant',
      expect.objectContaining({ appointmentId: 'appointment-1', assistantUserId: 'assistant-2' }),
    );
  });

  it('emits AppointmentRescheduledForDoctor instead of NewAppointmentBookedForDoctor when the hold carries rescheduledFromAppointmentId', async () => {
    const { tx, outbox, appointments, useCase } = arrange({ ...hold, rescheduled_from_appointment_id: 'appointment-old' });
    appointments.create.mockResolvedValue({ id: 'appointment-3' });

    await useCase.execute('hold-1', wallet, actor);

    expect(outbox.emit).toHaveBeenCalledWith(
      tx,
      'AppointmentRescheduledForDoctor',
      expect.objectContaining({ appointmentId: 'appointment-3', doctorUserId: 'doctor-user-1' }),
    );
    expect(outbox.emit).not.toHaveBeenCalledWith(tx, 'NewAppointmentBookedForDoctor', expect.anything());
  });

  it('surfaces INSUFFICIENT_WALLET_BALANCE from CaptureInternalWalletPaymentUseCase without creating the appointment', async () => {
    const { walletCapture, appointments, useCase } = arrange();
    walletCapture.execute.mockRejectedValue(Object.assign(new Error('insufficient'), { code: 'INSUFFICIENT_WALLET_BALANCE', httpStatus: 422 }));

    await expect(useCase.execute('hold-1', wallet, actor)).rejects.toMatchObject({ code: 'INSUFFICIENT_WALLET_BALANCE' });
    expect(appointments.create).not.toHaveBeenCalled();
  });
});
