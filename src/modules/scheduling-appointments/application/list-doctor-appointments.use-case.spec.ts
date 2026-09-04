import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { ListDoctorAppointmentsUseCase } from './list-doctor-appointments.use-case';

describe('ListDoctorAppointmentsUseCase', () => {
  const actor = { sub: 'user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;

  const affiliations = [
    { affiliationId: 'aff-1', clinicBranchId: 'branch-1' },
    { affiliationId: 'aff-2', clinicBranchId: 'branch-2' },
  ] as any[];

  function row(id: string, startAt: string) {
    return {
      id,
      status: 'CONFIRMED',
      slot_id: `slot-${id}`,
      slot: { start_at: new Date(startAt), end_at: new Date(startAt) },
      doctor_clinic_affiliation_id: 'aff-1',
      patient: { id: 'patient-1', first_name: 'Mona', last_name: 'Hassan', phone: '+201000000009' },
      affiliation: {
        clinic_branch: {
          id: 'branch-1',
          phone: '+201000000000',
          iana_timezone: 'Africa/Cairo',
          clinic: { id: 'clinic-1', brand_name: 'Nile Clinic' },
          address: { line1: '12 Tahrir St', city: 'Cairo' },
        },
      },
      cancelled_reason: null,
      cancelled_by: null,
      rescheduled_from_appointment_id: null,
      created_at: new Date(startAt),
    };
  }

  function setup() {
    const prisma = {} as any;
    const doctorScope = {
      execute: jest.fn().mockResolvedValue({
        doctorId: 'doctor-1',
        affiliations,
        affiliationIds: ['aff-1', 'aff-2'],
        clinicBranchIds: ['branch-1', 'branch-2'],
      }),
    };
    const appointments = { listForDoctor: jest.fn().mockResolvedValue([]) };
    const useCase = new ListDoctorAppointmentsUseCase(prisma, doctorScope as any, appointments as any);
    return { doctorScope, appointments, useCase };
  }

  it('scopes the query to every affiliation the JWT owns, with no client-supplied doctor id', async () => {
    const { appointments, useCase } = setup();

    await useCase.execute({}, actor);

    expect(appointments.listForDoctor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ affiliationIds: ['aff-1', 'aff-2'] }),
    );
  });

  it('narrows to a single branch rather than replacing the JWT-derived scope', async () => {
    const { appointments, useCase } = setup();

    await useCase.execute({ clinicBranchId: 'branch-2' }, actor);

    expect(appointments.listForDoctor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ affiliationIds: ['aff-2'] }));
  });

  it('404s a branch filter naming a branch the caller is not affiliated with', async () => {
    const { appointments, useCase } = setup();

    await expect(useCase.execute({ clinicBranchId: 'branch-999' }, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(appointments.listForDoctor).not.toHaveBeenCalled();
  });

  it('caps limit at 50 and over-fetches by one to detect a next page', async () => {
    const { appointments, useCase } = setup();

    await useCase.execute({ limit: 500 }, actor);

    expect(appointments.listForDoctor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 51 }));
  });

  it('returns a cursor only when more rows exist, and maps the patient identity the doctor needs', async () => {
    const { appointments, useCase } = setup();
    appointments.listForDoctor.mockResolvedValue([row('a', '2026-09-10T09:00:00Z'), row('b', '2026-09-10T10:00:00Z')]);

    const result = await useCase.execute({ limit: 1 }, actor);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      appointmentId: 'a',
      patientName: 'Mona Hassan',
      patientPhone: '+201000000009',
      clinicName: 'Nile Clinic',
      ianaTimezone: 'Africa/Cairo',
    });
    expect(result.nextCursor).not.toBeNull();
  });

  it('returns no cursor on the last page', async () => {
    const { appointments, useCase } = setup();
    appointments.listForDoctor.mockResolvedValue([row('a', '2026-09-10T09:00:00Z')]);

    const result = await useCase.execute({ limit: 20 }, actor);

    expect(result.nextCursor).toBeNull();
  });
});
