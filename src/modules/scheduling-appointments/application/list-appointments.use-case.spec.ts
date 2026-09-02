import { ListAppointmentsUseCase } from './list-appointments.use-case';

describe('ListAppointmentsUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;

  function appointmentRow(id: string, startAt: string) {
    return {
      id,
      slot_id: `slot-${id}`,
      patient_id: 'patient-1',
      doctor_clinic_affiliation_id: 'aff-1',
      status: 'CONFIRMED',
      cancelled_reason: null,
      rescheduled_from_appointment_id: null,
      slot: { start_at: new Date(startAt), end_at: new Date(startAt) },
      affiliation: {
        doctor: { id: 'doctor-1', user: { first_name: 'Mona', last_name: 'Fahmy' } },
        clinic_branch: {
          id: 'branch-1',
          phone: '+20 100 000 0000',
          clinic: { brand_name: 'Nour Clinic' },
          address: { line1: '12 Tahrir St', city: 'Cairo' },
        },
      },
    };
  }

  function setup() {
    const prisma = {};
    const appointments = { listForPatient: jest.fn() };
    const useCase = new ListAppointmentsUseCase(prisma as any, appointments as any);
    return { appointments, useCase };
  }

  it('scopes the query to the caller, requesting one extra row to detect a next page', async () => {
    const { appointments, useCase } = setup();
    appointments.listForPatient.mockResolvedValue([appointmentRow('a1', '2026-09-01T09:00:00Z')]);

    await useCase.execute({}, actor);

    expect(appointments.listForPatient).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ patientId: 'patient-1', limit: 21 }),
    );
  });

  it('returns no nextCursor when fewer rows than the limit come back', async () => {
    const { appointments, useCase } = setup();
    appointments.listForPatient.mockResolvedValue([appointmentRow('a1', '2026-09-01T09:00:00Z')]);

    const result = await useCase.execute({ limit: 20 }, actor);

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('returns an opaque nextCursor built from the last row when more rows exist than the limit', async () => {
    const { appointments, useCase } = setup();
    const rows = [
      appointmentRow('a1', '2026-09-01T09:00:00Z'),
      appointmentRow('a2', '2026-09-02T09:00:00Z'),
      appointmentRow('a3', '2026-09-03T09:00:00Z'),
    ];
    appointments.listForPatient.mockResolvedValue(rows);

    const result = await useCase.execute({ limit: 2 }, actor);

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toEqual(expect.any(String));

    const decoded = JSON.parse(Buffer.from(result.nextCursor as string, 'base64url').toString('utf8'));
    expect(decoded).toEqual({ s: '2026-09-02T09:00:00.000Z', i: 'a2' });
  });

  it('caps limit at 50 and defaults to 20', async () => {
    const { appointments, useCase } = setup();
    appointments.listForPatient.mockResolvedValue([]);

    await useCase.execute({ limit: 999 }, actor);
    expect(appointments.listForPatient).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 51 }));

    await useCase.execute({}, actor);
    expect(appointments.listForPatient).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 21 }));
  });
});
