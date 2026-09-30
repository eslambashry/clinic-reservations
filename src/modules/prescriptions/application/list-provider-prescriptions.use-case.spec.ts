import { ListProviderPrescriptionsUseCase } from './list-provider-prescriptions.use-case';

describe('ListProviderPrescriptionsUseCase', () => {
  const assistant = { sub: 'assistant-1', contextType: 'CLINIC_STAFF' } as any;
  const rows = [
    { id: 'p-2', patient_id: 'patient-2', status: 'PENDING_DOCTOR_APPROVAL', source: 'DOCTOR_ISSUED', version: 1, created_at: new Date('2026-09-23T11:00:00.000Z'), created_by_role: 'CLINIC_STAFF', decided_by_user_id: null, appointment_id: null },
    { id: 'p-1', patient_id: 'patient-1', status: 'ACCEPTED', source: 'DOCTOR_ISSUED', version: 2, created_at: new Date('2026-09-23T10:00:00.000Z'), created_by_role: 'CLINIC_STAFF', decided_by_user_id: 'doctor-user-1', appointment_id: 'appointment-1' },
  ];

  it('scopes assistants to their own submissions and returns decision identity with a stable next cursor', async () => {
    const prescriptions = { findByDoctorId: jest.fn().mockResolvedValue(rows) };
    const resolveDoctorScope = { execute: jest.fn().mockResolvedValue({ doctorUserId: 'doctor-user-1' }) };
    const useCase = new ListProviderPrescriptionsUseCase({} as any, prescriptions as any, resolveDoctorScope as any);

    const result = await useCase.execute({ limit: 1 }, assistant);

    expect(prescriptions.findByDoctorId).toHaveBeenCalledWith(
      expect.anything(), 'doctor-user-1', expect.objectContaining({ createdByUserId: 'assistant-1', limit: 2 }),
    );
    expect(result.prescriptions).toEqual([expect.objectContaining({ id: 'p-2', decidedByUserId: null })]);
    expect(result.nextCursor).toEqual(expect.any(String));
  });
});
