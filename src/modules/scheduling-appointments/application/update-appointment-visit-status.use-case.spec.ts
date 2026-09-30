import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { UpdateAppointmentVisitStatusUseCase } from './update-appointment-visit-status.use-case';

describe('UpdateAppointmentVisitStatusUseCase', () => {
  const actor = {
    sub: 'assistant-user-1',
    roleMembershipId: 'membership-1',
    roleCode: 'CLINIC_STAFF',
    contextType: 'CLINIC_STAFF',
    permissions: [],
  } as any;

  const appointment = {
    id: 'appointment-1',
    slot_id: 'slot-1',
    patient_id: 'patient-1',
    doctor_clinic_affiliation_id: 'aff-1',
    status: 'CONFIRMED',
    visit_status: 'WAITING',
    version: 3,
    cancelled_reason: null,
    cancelled_by: null,
    rescheduled_from_appointment_id: null,
    created_at: new Date('2026-09-17T08:00:00Z'),
    slot: {
      start_at: new Date('2026-09-17T09:00:00Z'),
      end_at: new Date('2026-09-17T09:30:00Z'),
    },
    patient: { id: 'patient-1', first_name: 'Mona', last_name: 'Hassan', phone: '+201000000009' },
    affiliation: {
      clinic_branch: {
        id: 'branch-1',
        phone: '+20200000000',
        iana_timezone: 'Africa/Cairo',
        clinic: { id: 'clinic-1', brand_name: 'Nile Clinic' },
        address: { line1: '12 Tahrir St', city: 'Cairo' },
      },
    },
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-17T09:15:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setup(row: Record<string, unknown> = appointment) {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const updated = { ...appointment, ...row, visit_status: 'IN_DOCTOR_ROOM', version: 4 };
    const appointments = {
      findByIdWithDoctorView: jest.fn().mockResolvedValueOnce(row).mockResolvedValueOnce(updated),
      updateVisitStatus: jest.fn(),
    };
    const appointmentScope = {
      execute: jest.fn().mockResolvedValue({ kind: 'CLINIC_STAFF', doctorId: 'doctor-1', affiliationIds: ['aff-1'] }),
    };
    const audit = { record: jest.fn() };
    const useCase = new UpdateAppointmentVisitStatusUseCase(
      prisma as any,
      appointments as any,
      appointmentScope as any,
      audit as any,
    );
    return { tx, appointments, appointmentScope, audit, useCase };
  }

  it('persists WAITING -> IN_DOCTOR_ROOM, audits it, and returns the updated record', async () => {
    const { tx, appointments, audit, useCase } = setup();

    const result = await useCase.execute('appointment-1', { status: 'IN_DOCTOR_ROOM', version: 3 }, actor);

    expect(appointments.updateVisitStatus).toHaveBeenCalledWith(tx, 'appointment-1', 3, 'IN_DOCTOR_ROOM');
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: 'assistant-user-1',
        resourceId: 'appointment-1',
        subjectPatientId: 'patient-1',
        reasonCode: 'WAITING_TO_IN_DOCTOR_ROOM',
      }),
    );
    expect(result).toMatchObject({ appointmentId: 'appointment-1', visitStatus: 'IN_DOCTOR_ROOM', version: 4 });
  });

  it('rejects skipped, repeated, and backward transitions with 422', async () => {
    const cases = [
      [{ ...appointment, visit_status: 'WAITING' }, 'LEFT'],
      [{ ...appointment, visit_status: 'WAITING' }, 'WAITING'],
      [{ ...appointment, visit_status: 'IN_DOCTOR_ROOM' }, 'WAITING'],
      [{ ...appointment, visit_status: 'LEFT' }, 'IN_DOCTOR_ROOM'],
    ] as const;

    for (const [row, target] of cases) {
      const { appointments, audit, useCase } = setup(row);
      await expect(useCase.execute('appointment-1', { status: target, version: 3 }, actor)).rejects.toMatchObject({
        code: 'INVALID_VISIT_STATUS_TRANSITION',
        httpStatus: 422,
      });
      expect(appointments.updateVisitStatus).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    }
  });

  it('rejects non-confirmed appointments', async () => {
    const { appointments, useCase } = setup({ ...appointment, status: 'CANCELLED' });

    await expect(useCase.execute('appointment-1', { status: 'IN_DOCTOR_ROOM', version: 3 }, actor)).rejects.toMatchObject({
      code: 'APPOINTMENT_VISIT_STATUS_NOT_UPDATABLE',
      httpStatus: 422,
    });
    expect(appointments.updateVisitStatus).not.toHaveBeenCalled();
  });

  it('404s an appointment outside the assistant assigned affiliations', async () => {
    const { appointmentScope, appointments, useCase } = setup();
    appointmentScope.execute.mockResolvedValue({ kind: 'CLINIC_STAFF', doctorId: 'doctor-1', affiliationIds: ['aff-other'] });

    await expect(useCase.execute('appointment-1', { status: 'IN_DOCTOR_ROOM', version: 3 }, actor)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(appointments.updateVisitStatus).not.toHaveBeenCalled();
  });

  it('returns an optimistic-lock conflict for a stale version', async () => {
    const { appointments, useCase } = setup();

    await expect(useCase.execute('appointment-1', { status: 'IN_DOCTOR_ROOM', version: 2 }, actor)).rejects.toBeInstanceOf(
      OptimisticLockError,
    );
    expect(appointments.updateVisitStatus).not.toHaveBeenCalled();
  });

  it('allows a transition before the appointment starts', async () => {
    jest.setSystemTime(new Date('2026-09-17T06:00:00.000Z'));
    const { appointments, useCase } = setup();

    const result = await useCase.execute(
      'appointment-1',
      { status: 'IN_DOCTOR_ROOM', version: 3 },
      actor,
    );

    expect(appointments.updateVisitStatus).toHaveBeenCalledWith(
      expect.anything(),
      'appointment-1',
      3,
      'IN_DOCTOR_ROOM',
    );
    expect(result.visitStatus).toBe('IN_DOCTOR_ROOM');
  });

  it('allows a transition after the appointment ends', async () => {
    jest.setSystemTime(new Date('2026-09-17T18:00:00.000Z'));
    const { appointments, useCase } = setup();

    const result = await useCase.execute(
      'appointment-1',
      { status: 'IN_DOCTOR_ROOM', version: 3 },
      actor,
    );

    expect(appointments.updateVisitStatus).toHaveBeenCalledWith(
      expect.anything(),
      'appointment-1',
      3,
      'IN_DOCTOR_ROOM',
    );
    expect(result.visitStatus).toBe('IN_DOCTOR_ROOM');
  });

  it('allows a transition independently of the current slot after reschedule', async () => {
    const rescheduled = {
      ...appointment,
      slot: {
        start_at: new Date('2026-09-22T15:00:00.000Z'),
        end_at: new Date('2026-09-22T15:30:00.000Z'),
      },
    };
    const { appointments, useCase } = setup(rescheduled);

    const result = await useCase.execute(
      'appointment-1',
      { status: 'IN_DOCTOR_ROOM', version: 3 },
      actor,
    );

    expect(appointments.updateVisitStatus).toHaveBeenCalledWith(
      expect.anything(),
      'appointment-1',
      3,
      'IN_DOCTOR_ROOM',
    );
    expect(result.visitStatus).toBe('IN_DOCTOR_ROOM');
  });
});
