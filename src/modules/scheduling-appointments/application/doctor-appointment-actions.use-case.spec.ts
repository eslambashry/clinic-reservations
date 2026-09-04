import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CancelAppointmentUseCase } from './cancel-appointment.use-case';
import { RescheduleAppointmentUseCase } from './reschedule-appointment.use-case';

/**
 * File 12 Part 49.8/49.9 — the DOCTOR arm of the two shared appointment
 * use-cases. The PATIENT arm keeps its own specs
 * (`cancel-appointment.use-case.spec.ts` / `reschedule-appointment.use-case.spec.ts`);
 * these assert only what the provider path adds or changes.
 */
describe('Doctor-initiated appointment actions', () => {
  const doctorActor = { sub: 'doctor-user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;
  const appointment = {
    id: 'appointment-1',
    slot_id: 'old-slot',
    patient_id: 'patient-1',
    doctor_clinic_affiliation_id: 'aff-1',
    status: 'CONFIRMED',
    version: 1,
    payment_intent_id: 'intent-1',
  };

  const doctorScope = { kind: 'DOCTOR', doctorId: 'doctor-1', affiliationIds: ['aff-1'] };
  const foreignScope = { kind: 'DOCTOR', doctorId: 'doctor-2', affiliationIds: ['aff-other'] };

  describe('cancel', () => {
    function setup(scope: unknown = doctorScope) {
      const tx = {} as any;
      const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
      const appointments = { findById: jest.fn().mockResolvedValue(appointment), cancel: jest.fn().mockResolvedValue(true) };
      const slots = { releaseBooked: jest.fn() };
      const policyConfig = { getValue: jest.fn().mockResolvedValue({ feePercent: 10 }) };
      const refund = { execute: jest.fn().mockResolvedValue({ refundAmount: '250.00', feeApplied: '0.00' }) };
      const audit = { record: jest.fn() };
      const outbox = { emit: jest.fn() };
      const appointmentScope = { execute: jest.fn().mockResolvedValue(scope) };
      const useCase = new CancelAppointmentUseCase(
        prisma as any,
        appointments as any,
        slots as any,
        policyConfig as any,
        refund as any,
        audit as any,
        outbox as any,
        appointmentScope as any,
      );
      return { tx, appointments, slots, policyConfig, refund, audit, outbox, useCase };
    }

    it("404s an appointment outside the doctor's own affiliations", async () => {
      const { useCase } = setup(foreignScope);

      await expect(useCase.execute('appointment-1', { reason: 'PROVIDER_REQUEST' }, doctorActor)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('422s when a doctor sends a non-PROVIDER_REQUEST reason, before touching any row', async () => {
      const { appointments, useCase } = setup();

      await expect(useCase.execute('appointment-1', { reason: 'PATIENT_REQUEST' }, doctorActor)).rejects.toMatchObject({
        code: 'CANCELLATION_REASON_NOT_PERMITTED',
        httpStatus: 422,
      });
      expect(appointments.findById).not.toHaveBeenCalled();
    });

    it('releases the slot, refunds in full with no fee, audits and emits — all in one transaction', async () => {
      const { tx, appointments, slots, policyConfig, refund, audit, outbox, useCase } = setup();

      const result = await useCase.execute('appointment-1', { reason: 'PROVIDER_REQUEST', note: 'Doctor unavailable' }, doctorActor);

      expect(appointments.cancel).toHaveBeenCalledWith(tx, 'appointment-1', 1, 'doctor-user-1', 'PROVIDER_REQUEST: Doctor unavailable');
      expect(slots.releaseBooked).toHaveBeenCalledWith(tx, 'old-slot');
      // Provider-initiated cancellation waives the fee entirely, so the
      // CANCELLATION_TIER policy is never even read (File 11 line 475).
      expect(policyConfig.getValue).not.toHaveBeenCalled();
      expect(refund.execute).toHaveBeenCalledWith(tx, { paymentIntentId: 'intent-1', feePercent: 0 });
      expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'scheduling_appointments.appointment.cancel', reasonCode: 'PROVIDER_REQUEST' }));
      expect(outbox.emit).toHaveBeenCalledWith(
        tx,
        'AppointmentCancelled',
        expect.objectContaining({ patientId: 'patient-1', cancelledBy: 'DOCTOR', reason: 'PROVIDER_REQUEST' }),
      );
      expect(result).toEqual({ status: 'CANCELLED', refundAmount: 250, feeApplied: 0 });
    });

    it('409s instead of double-cancelling when the version guard loses a race', async () => {
      const { appointments, refund, outbox, useCase } = setup();
      appointments.cancel.mockResolvedValue(false);

      await expect(useCase.execute('appointment-1', { reason: 'PROVIDER_REQUEST' }, doctorActor)).rejects.toMatchObject({
        code: 'APPOINTMENT_STATE_CHANGED',
        httpStatus: 409,
      });
      expect(refund.execute).not.toHaveBeenCalled();
      expect(outbox.emit).not.toHaveBeenCalled();
    });
  });

  describe('reschedule', () => {
    const newSlot = { id: 'new-slot', doctor_clinic_affiliation_id: 'aff-1', status: 'OPEN' };

    function setup(scope: unknown = doctorScope) {
      const tx = {} as any;
      const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
      const appointments = {
        findById: jest.fn().mockResolvedValue(appointment),
        markRescheduled: jest.fn().mockResolvedValue(true),
        create: jest.fn().mockResolvedValue({ id: 'appointment-2' }),
      };
      const slots = {
        findById: jest.fn().mockResolvedValue(newSlot),
        releaseBooked: jest.fn(),
        markHeld: jest.fn().mockResolvedValue(true),
        markBooked: jest.fn().mockResolvedValue(true),
      };
      const holds = { create: jest.fn().mockResolvedValue({ id: 'hold-1', version: 1 }), markConverted: jest.fn() };
      const audit = { record: jest.fn() };
      const outbox = { emit: jest.fn() };
      const appointmentScope = { execute: jest.fn().mockResolvedValue(scope) };
      const useCase = new RescheduleAppointmentUseCase(
        prisma as any,
        appointments as any,
        slots as any,
        holds as any,
        audit as any,
        outbox as any,
        appointmentScope as any,
      );
      return { tx, appointments, slots, holds, audit, outbox, useCase };
    }

    it("404s an appointment outside the doctor's own affiliations", async () => {
      const { useCase } = setup(foreignScope);

      await expect(useCase.execute('appointment-1', { newSlotId: 'new-slot' }, doctorActor)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('404s a slot belonging to a different affiliation — a doctor cannot move a patient onto another calendar', async () => {
      const { slots, useCase } = setup();
      slots.findById.mockResolvedValue({ ...newSlot, doctor_clinic_affiliation_id: 'aff-other' });

      await expect(useCase.execute('appointment-1', { newSlotId: 'new-slot' }, doctorActor)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('completes the move in one transaction and returns the new CONFIRMED appointment', async () => {
      const { tx, slots, holds, useCase } = setup();

      const result = await useCase.execute('appointment-1', { newSlotId: 'new-slot' }, doctorActor);

      // The full hold spine still runs, in order — nothing is skipped.
      expect(slots.markHeld).toHaveBeenCalledWith(tx, 'new-slot');
      expect(holds.markConverted).toHaveBeenCalledWith(tx, 'hold-1', 1, expect.any(Date));
      expect(slots.markBooked).toHaveBeenCalledWith(tx, 'new-slot');
      expect(slots.releaseBooked).toHaveBeenCalledWith(tx, 'old-slot');
      expect(result).toEqual({
        status: 'CONFIRMED',
        appointmentId: 'appointment-2',
        slotId: 'new-slot',
        previousAppointmentId: 'appointment-1',
      });
    });

    it('keeps the hold owned by the patient and carries the payment intent onto the new row', async () => {
      const { tx, appointments, holds, useCase } = setup();

      await useCase.execute('appointment-1', { newSlotId: 'new-slot' }, doctorActor);

      expect(holds.create).toHaveBeenCalledWith(tx, expect.objectContaining({ patientId: 'patient-1', rescheduledFromAppointmentId: 'appointment-1' }));
      expect(appointments.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          patientId: 'patient-1',
          doctorClinicAffiliationId: 'aff-1',
          rescheduledFromAppointmentId: 'appointment-1',
          paymentIntentId: 'intent-1',
        }),
      );
    });

    it('emits AppointmentRescheduledByProvider, not the patient-path AppointmentHeld', async () => {
      const { tx, outbox, useCase } = setup();

      await useCase.execute('appointment-1', { newSlotId: 'new-slot' }, doctorActor);

      const events = outbox.emit.mock.calls.map((call: unknown[]) => call[1]);
      expect(events).toContain('AppointmentRescheduledByProvider');
      expect(events).not.toContain('AppointmentHeld');
      expect(outbox.emit).toHaveBeenCalledWith(
        tx,
        'AppointmentRescheduledByProvider',
        expect.objectContaining({ appointmentId: 'appointment-2', previousAppointmentId: 'appointment-1', patientId: 'patient-1' }),
      );
    });

    it('409s and creates nothing when the new slot is claimed between markHeld and markBooked', async () => {
      const { appointments, slots, useCase } = setup();
      slots.markBooked.mockResolvedValue(false);

      await expect(useCase.execute('appointment-1', { newSlotId: 'new-slot' }, doctorActor)).rejects.toMatchObject({
        code: 'SLOT_ALREADY_BOOKED',
        httpStatus: 409,
      });
      expect(appointments.create).not.toHaveBeenCalled();
    });
  });
});
