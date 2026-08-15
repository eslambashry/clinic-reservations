import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetAppointmentUseCase } from './get-appointment.use-case';

describe('GetAppointmentUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const appointment = {
    id: 'appointment-1',
    slot_id: 'slot-1',
    patient_id: 'patient-1',
    doctor_clinic_affiliation_id: 'aff-1',
    status: 'CONFIRMED',
    cancelled_reason: null,
    rescheduled_from_appointment_id: null,
    slot: { start_at: new Date('2026-09-01T09:00:00Z'), end_at: new Date('2026-09-01T09:20:00Z') },
  };

  function setup() {
    const prisma = {};
    const appointments = { findByIdWithSlotTimes: jest.fn() };
    const useCase = new GetAppointmentUseCase(prisma as any, appointments as any);
    return { appointments, useCase };
  }

  it('404s when the appointment does not exist or belongs to a different patient', async () => {
    const { appointments, useCase } = setup();
    appointments.findByIdWithSlotTimes.mockResolvedValue(null);

    await expect(useCase.execute('appointment-1', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when the appointment belongs to a different patient', async () => {
    const { appointments, useCase } = setup();
    appointments.findByIdWithSlotTimes.mockResolvedValue({ ...appointment, patient_id: 'someone-else' });

    await expect(useCase.execute('appointment-1', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('maps the appointment + slot into a flat summary', async () => {
    const { appointments, useCase } = setup();
    appointments.findByIdWithSlotTimes.mockResolvedValue(appointment);

    const result = await useCase.execute('appointment-1', actor);

    expect(result).toEqual({
      appointmentId: 'appointment-1',
      status: 'CONFIRMED',
      slotId: 'slot-1',
      startAt: appointment.slot.start_at,
      endAt: appointment.slot.end_at,
      doctorClinicAffiliationId: 'aff-1',
      cancelledReason: null,
      rescheduledFromAppointmentId: null,
    });
  });
});
