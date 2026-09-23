import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetProviderPrescriptionUseCase } from './get-provider-prescription.use-case';

describe('GetProviderPrescriptionUseCase', () => {
  const doctor = { sub: 'doctor-user-1', contextType: 'DOCTOR' } as any;
  const assistant = { sub: 'assistant-1', contextType: 'CLINIC_STAFF' } as any;
  const row = {
    id: 'prescription-1', patient_id: 'patient-1', doctor_id: 'doctor-user-1', created_by_user_id: 'assistant-1',
    created_by_role: 'CLINIC_STAFF', decided_by_user_id: 'doctor-user-1', appointment_id: null, status: 'ACCEPTED',
    source: 'DOCTOR_ISSUED', notes: null, version: 2, approved_at: new Date('2026-09-23T10:00:00.000Z'), rejected_at: null,
    rejection_reason: null,
  };

  function setup() {
    const prescriptions = { findById: jest.fn().mockResolvedValue(row) };
    const items = { findByPrescriptionId: jest.fn().mockResolvedValue([]) };
    const resolveDoctorScope = { execute: jest.fn().mockResolvedValue({ doctorUserId: 'doctor-user-1' }) };
    return {
      prescriptions, items, resolveDoctorScope,
      useCase: new GetProviderPrescriptionUseCase({} as any, prescriptions as any, items as any, resolveDoctorScope as any),
    };
  }

  it('returns the supervising doctor decision identity in a provider-scoped detail response', async () => {
    const { useCase } = setup();

    await expect(useCase.execute('prescription-1', doctor)).resolves.toMatchObject({
      id: 'prescription-1', decidedByUserId: 'doctor-user-1', approvedAt: '2026-09-23T10:00:00.000Z',
    });
  });

  it('hides a different doctor\'s prescription and does not read its items', async () => {
    const { prescriptions, items, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ ...row, doctor_id: 'doctor-user-2' });

    await expect(useCase.execute('prescription-1', doctor)).rejects.toBeInstanceOf(NotFoundError);
    expect(items.findByPrescriptionId).not.toHaveBeenCalled();
  });

  it('hides another assistant\'s submission even when both are in the same doctor scope', async () => {
    const { prescriptions, items, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ ...row, created_by_user_id: 'assistant-2' });

    await expect(useCase.execute('prescription-1', assistant)).rejects.toBeInstanceOf(NotFoundError);
    expect(items.findByPrescriptionId).not.toHaveBeenCalled();
  });
});
