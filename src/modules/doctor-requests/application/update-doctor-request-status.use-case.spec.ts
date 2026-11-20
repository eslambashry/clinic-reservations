import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateDoctorRequestStatusUseCase } from './update-doctor-request-status.use-case';

describe('UpdateDoctorRequestStatusUseCase', () => {
  const tx = {};
  const row = { id: 'req-1', patient_id: 'patient-1', doctor_name: 'Dr Ahmed', status: 'PENDING', version: 3 };

  function setup(found: unknown = row) {
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const requests = { findById: jest.fn().mockResolvedValue(found), setStatus: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new UpdateDoctorRequestStatusUseCase(prisma as any, requests as any, outbox as any);
    return { requests, outbox, useCase };
  }

  it('updates the status with a trimmed note and notifies the patient', async () => {
    const { requests, outbox, useCase } = setup();

    const result = await useCase.execute('req-1', 'DOCTOR_ADDED', '  added today ');

    expect(requests.setStatus).toHaveBeenCalledWith(tx, 'req-1', 3, 'DOCTOR_ADDED', 'added today');
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'DoctorRequestStatusChanged', { patientId: 'patient-1', doctorRequestId: 'req-1', status: 'DOCTOR_ADDED', doctorName: 'Dr Ahmed' });
    expect(result).toEqual({ id: 'req-1', status: 'DOCTOR_ADDED' });
  });

  it('keeps the existing note when none is sent and clears it when blank', async () => {
    const first = setup();
    await first.useCase.execute('req-1', 'IN_REVIEW');
    expect(first.requests.setStatus).toHaveBeenCalledWith(tx, 'req-1', 3, 'IN_REVIEW', undefined);

    const second = setup();
    await second.useCase.execute('req-1', 'IN_REVIEW', '   ');
    expect(second.requests.setStatus).toHaveBeenCalledWith(tx, 'req-1', 3, 'IN_REVIEW', null);
  });

  it('404s on an unknown request', async () => {
    const { useCase } = setup(null);
    await expect(useCase.execute('req-1', 'IN_REVIEW')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to change a decided request', async () => {
    const { requests, outbox, useCase } = setup({ ...row, status: 'REJECTED' });

    await expect(useCase.execute('req-1', 'IN_REVIEW')).rejects.toBeInstanceOf(BusinessRuleError);
    expect(requests.setStatus).not.toHaveBeenCalled();
    expect(outbox.emit).not.toHaveBeenCalled();
  });
});
