import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CancelAppointmentUseCase } from './cancel-appointment.use-case';

function buildTx() {
  return {} as any;
}

describe('CancelAppointmentUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const appointment = {
    id: 'appointment-1',
    slot_id: 'slot-1',
    patient_id: 'patient-1',
    status: 'CONFIRMED',
    visit_status: 'WAITING',
    version: 1,
    doctor_clinic_affiliation_id: 'aff-1',
  };
  // Far enough ahead that the PM-APPT-01 patient cutoff never interferes
  // with tests that are about something else.
  const futureSlot = { id: 'slot-1', start_at: new Date('2099-01-01T09:00:00Z') };
  const appointmentWithPayment = { ...appointment, payment_intent_id: 'intent-1' };
  const input = { reason: 'PATIENT_REQUEST' as const };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const appointments = { findById: jest.fn(), cancel: jest.fn() };
    const slots = { releaseBooked: jest.fn(), findById: jest.fn().mockResolvedValue(futureSlot) };
    const policyConfig = { getValue: jest.fn() };
    const refund = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const appointmentScope = { execute: jest.fn().mockResolvedValue({ kind: 'PATIENT', patientUserId: 'patient-1' }) };
    const affiliationBilling = {
      execute: jest.fn().mockResolvedValue({
        consultFee: '200.00',
        currency: 'EGP',
        doctorId: 'doctor-1',
        doctorUserId: 'doctor-user-1',
        clinicBranchId: 'branch-1',
      }),
    };
    const assistantUserIds = { execute: jest.fn().mockResolvedValue([]) };
    const useCase = new CancelAppointmentUseCase(
      prisma as any,
      appointments as any,
      slots as any,
      policyConfig as any,
      refund as any,
      audit as any,
      outbox as any,
      appointmentScope as any,
      affiliationBilling as any,
      assistantUserIds as any,
    );
    return { tx, appointments, slots, policyConfig, refund, audit, outbox, appointmentScope, affiliationBilling, assistantUserIds, useCase };
  }

  it('404s when the appointment does not exist or belongs to a different patient', async () => {
    const { appointments, useCase } = setup();
    appointments.findById.mockResolvedValue(null);

    await expect(useCase.execute('appointment-1', input, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('422s (APPOINTMENT_NOT_CANCELLABLE) when the appointment is not CONFIRMED', async () => {
    const { appointments, useCase } = setup();
    appointments.findById.mockResolvedValue({ ...appointment, status: 'CANCELLED' });

    await expect(useCase.execute('appointment-1', input, actor)).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_CANCELLABLE', httpStatus: 422 });
  });

  it('409s (APPOINTMENT_STATE_CHANGED) when the version-guarded cancel loses a concurrent race', async () => {
    const { appointments, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    appointments.cancel.mockResolvedValue(false);

    await expect(useCase.execute('appointment-1', input, actor)).rejects.toMatchObject({ code: 'APPOINTMENT_STATE_CHANGED', httpStatus: 409 });
  });

  it('cancels, releases the slot, audits, and emits AppointmentCancelled, returning zeroed fee/refund when there is no payment_intent_id', async () => {
    const { tx, appointments, slots, refund, audit, outbox, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    appointments.cancel.mockResolvedValue(true);

    const result = await useCase.execute('appointment-1', input, actor);

    expect(result).toEqual({ status: 'CANCELLED', refundAmount: 0, feeApplied: 0 });
    expect(refund.execute).not.toHaveBeenCalled();
    // The patient cutoff instant is repeated inside the write (PM-APPT-01).
    expect(appointments.cancel).toHaveBeenCalledWith(tx, 'appointment-1', 1, 'patient-1', 'PATIENT_REQUEST', expect.any(Date));
    expect(slots.releaseBooked).toHaveBeenCalledWith(tx, 'slot-1');
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ actorUserId: 'patient-1', action: 'scheduling_appointments.appointment.cancel', resourceId: 'appointment-1' }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'AppointmentCancelled', expect.objectContaining({ appointmentId: 'appointment-1' }));
    expect(outbox.emit).toHaveBeenCalledWith(
      tx,
      'AppointmentCancelledForDoctor',
      expect.objectContaining({ appointmentId: 'appointment-1', doctorUserId: 'doctor-user-1' }),
    );
  });

  it('notifies every assistant assigned to the branch when the doctor is not the canceller', async () => {
    const { appointments, outbox, assistantUserIds, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    appointments.cancel.mockResolvedValue(true);
    assistantUserIds.execute.mockResolvedValue(['assistant-1', 'assistant-2']);

    await useCase.execute('appointment-1', input, actor);

    expect(assistantUserIds.execute).toHaveBeenCalledWith(expect.anything(), 'branch-1');
    expect(outbox.emit).toHaveBeenCalledWith(
      expect.anything(),
      'AppointmentCancelledForAssistant',
      expect.objectContaining({ appointmentId: 'appointment-1', assistantUserId: 'assistant-1' }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(
      expect.anything(),
      'AppointmentCancelledForAssistant',
      expect.objectContaining({ appointmentId: 'appointment-1', assistantUserId: 'assistant-2' }),
    );
  });

  it('does not notify assistants either when the doctor themselves cancelled', async () => {
    const { appointments, outbox, appointmentScope, assistantUserIds, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    appointments.cancel.mockResolvedValue(true);
    appointmentScope.execute.mockResolvedValue({ kind: 'DOCTOR', doctorId: 'doctor-1', affiliationIds: ['aff-1'] });

    await useCase.execute('appointment-1', { reason: 'PROVIDER_REQUEST' }, actor);

    expect(assistantUserIds.execute).not.toHaveBeenCalled();
    const assistantNotifyCalls = outbox.emit.mock.calls.filter((call: unknown[]) => call[1] === 'AppointmentCancelledForAssistant');
    expect(assistantNotifyCalls).toHaveLength(0);
  });

  it('does not notify the doctor when the doctor themselves cancelled', async () => {
    const { appointments, outbox, appointmentScope, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    appointments.cancel.mockResolvedValue(true);
    appointmentScope.execute.mockResolvedValue({ kind: 'DOCTOR', doctorId: 'doctor-1', affiliationIds: ['aff-1'] });

    await useCase.execute('appointment-1', { reason: 'PROVIDER_REQUEST' }, actor);

    const doctorNotifyCalls = outbox.emit.mock.calls.filter((call: unknown[]) => call[1] === 'AppointmentCancelledForDoctor');
    expect(doctorNotifyCalls).toHaveLength(0);
  });

  it('reads the CANCELLATION_TIER fee percent and processes a real refund when a payment_intent_id is present', async () => {
    const { tx, appointments, policyConfig, refund, useCase } = setup();
    appointments.findById.mockResolvedValue(appointmentWithPayment);
    appointments.cancel.mockResolvedValue(true);
    policyConfig.getValue.mockResolvedValue({ feePercent: 10 });
    refund.execute.mockResolvedValue({ refundAmount: '180.00', feeApplied: '20.00' });

    const result = await useCase.execute('appointment-1', input, actor);

    expect(policyConfig.getValue).toHaveBeenCalledWith(tx, 'EG', 'CANCELLATION_TIER');
    expect(refund.execute).toHaveBeenCalledWith(tx, { paymentIntentId: 'intent-1', feePercent: 10 });
    expect(result).toEqual({ status: 'CANCELLED', refundAmount: 180, feeApplied: 20 });
  });

  it('bypasses the CANCELLATION_TIER read entirely and always uses feePercent 0 for a provider-initiated cancellation', async () => {
    const { tx, appointments, policyConfig, refund, useCase } = setup();
    appointments.findById.mockResolvedValue(appointmentWithPayment);
    appointments.cancel.mockResolvedValue(true);
    refund.execute.mockResolvedValue({ refundAmount: '200.00', feeApplied: '0.00' });

    const result = await useCase.execute('appointment-1', { reason: 'PROVIDER_REQUEST' }, actor);

    expect(policyConfig.getValue).not.toHaveBeenCalled();
    expect(refund.execute).toHaveBeenCalledWith(tx, { paymentIntentId: 'intent-1', feePercent: 0 });
    expect(result).toEqual({ status: 'CANCELLED', refundAmount: 200, feeApplied: 0 });
  });

  it('folds an optional note into the persisted cancelled_reason', async () => {
    const { appointments, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    appointments.cancel.mockResolvedValue(true);

    await useCase.execute('appointment-1', { reason: 'OTHER', note: 'doctor unavailable' }, actor);

    expect(appointments.cancel).toHaveBeenCalledWith(expect.anything(), 'appointment-1', 1, 'patient-1', 'OTHER: doctor unavailable', expect.any(Date));
  });

  describe('approved V1 rules (PM-APPT-01/02/05)', () => {
    afterEach(() => jest.useRealTimers());

    function expectNoSideEffects(m: ReturnType<typeof setup>) {
      expect(m.appointments.cancel).not.toHaveBeenCalled();
      expect(m.slots.releaseBooked).not.toHaveBeenCalled();
      expect(m.refund.execute).not.toHaveBeenCalled();
      expect(m.audit.record).not.toHaveBeenCalled();
      expect(m.outbox.emit).not.toHaveBeenCalled();
    }

    it.each(['IN_DOCTOR_ROOM', 'LEFT'])('422s (APPOINTMENT_VISIT_IN_PROGRESS) without writing anything once the visit is %s', async (visitStatus) => {
      const m = setup();
      m.appointments.findById.mockResolvedValue({ ...appointmentWithPayment, visit_status: visitStatus });

      await expect(m.useCase.execute('appointment-1', input, actor)).rejects.toMatchObject({ code: 'APPOINTMENT_VISIT_IN_PROGRESS', httpStatus: 422 });
      expectNoSideEffects(m);
    });

    it('422s (APPOINTMENT_VISIT_ENDED) for a visit the system already expired', async () => {
      const m = setup();
      m.appointments.findById.mockResolvedValue({ ...appointmentWithPayment, visit_status: 'TIME_EXPIRED' });

      await expect(m.useCase.execute('appointment-1', input, actor)).rejects.toMatchObject({ code: 'APPOINTMENT_VISIT_ENDED', httpStatus: 422 });
      expectNoSideEffects(m);
    });

    it.each([
      ['exactly at start_at', '2026-10-03T09:00:00.000Z'],
      ['after start_at', '2026-10-03T09:00:00.001Z'],
      ['a day later', '2026-10-04T09:00:00.000Z'],
    ])('422s (APPOINTMENT_CHANGE_WINDOW_CLOSED) for a patient %s, with no refund', async (_label, now) => {
      jest.useFakeTimers().setSystemTime(new Date(now));
      const m = setup();
      m.appointments.findById.mockResolvedValue(appointmentWithPayment);
      m.slots.findById.mockResolvedValue({ id: 'slot-1', start_at: new Date('2026-10-03T09:00:00.000Z') });

      await expect(m.useCase.execute('appointment-1', input, actor)).rejects.toMatchObject({ code: 'APPOINTMENT_CHANGE_WINDOW_CLOSED', httpStatus: 422 });
      expectNoSideEffects(m);
    });

    it('lets a patient cancel 1 ms before start_at, with the unchanged pre-start fee/refund behaviour', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-03T08:59:59.999Z'));
      const m = setup();
      m.appointments.findById.mockResolvedValue(appointmentWithPayment);
      m.appointments.cancel.mockResolvedValue(true);
      m.slots.findById.mockResolvedValue({ id: 'slot-1', start_at: new Date('2026-10-03T09:00:00.000Z') });
      m.policyConfig.getValue.mockResolvedValue({ feePercent: 10 });
      m.refund.execute.mockResolvedValue({ refundAmount: '180.00', feeApplied: '20.00' });

      await expect(m.useCase.execute('appointment-1', input, actor)).resolves.toEqual({ status: 'CANCELLED', refundAmount: 180, feeApplied: 20 });
      expect(m.appointments.cancel).toHaveBeenCalledWith(expect.anything(), 'appointment-1', 1, 'patient-1', 'PATIENT_REQUEST', new Date('2026-10-03T08:59:59.999Z'));
      expect(m.refund.execute).toHaveBeenCalledWith(expect.anything(), { paymentIntentId: 'intent-1', feePercent: 10 });
    });

    it('403s an assistant (CLINIC_STAFF) before reading the appointment — provider cancellation is doctor-only', async () => {
      const m = setup();
      m.appointmentScope.execute.mockResolvedValue({ kind: 'CLINIC_STAFF', doctorId: 'doctor-1', affiliationIds: ['aff-1'] });
      const assistant = { ...actor, sub: 'assistant-1', roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF' };

      await expect(m.useCase.execute('appointment-1', { reason: 'PROVIDER_REQUEST' }, assistant)).rejects.toMatchObject({
        code: 'ROLE_NOT_PERMITTED',
        httpStatus: 403,
      });
      expect(m.appointments.findById).not.toHaveBeenCalled();
      expectNoSideEffects(m);
    });

    it('409s (APPOINTMENT_STATE_CHANGED) when the visit starts between the check and the guarded write', async () => {
      const m = setup();
      m.appointments.findById.mockResolvedValue(appointment);
      m.appointments.cancel.mockResolvedValue(false); // repository WHERE no longer matches WAITING

      await expect(m.useCase.execute('appointment-1', input, actor)).rejects.toMatchObject({ code: 'APPOINTMENT_STATE_CHANGED', httpStatus: 409 });
      expect(m.slots.releaseBooked).not.toHaveBeenCalled();
      expect(m.refund.execute).not.toHaveBeenCalled();
    });
  });
});
