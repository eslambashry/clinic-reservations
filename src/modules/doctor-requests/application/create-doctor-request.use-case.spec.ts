import { BusinessRuleError } from '../../../shared/core/errors/domain-errors';
import { CreateDoctorRequestUseCase } from './create-doctor-request.use-case';

describe('CreateDoctorRequestUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'm-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const tx = {};
  const created = {
    id: 'req-1',
    doctor_name: 'Dr Ahmed',
    clinic_name: null,
    location: null,
    specialty: null,
    contact_phone: null,
    notes: null,
    status: 'PENDING',
    admin_note: null,
    created_at: new Date('2026-11-20T10:00:00Z'),
    updated_at: new Date('2026-11-20T10:00:00Z'),
  };

  function setup(openCount = 0, adminIds = ['admin-1', 'admin-2']) {
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const requests = {
      countOpenForPatient: jest.fn().mockResolvedValue(openCount),
      create: jest.fn().mockResolvedValue(created),
    };
    const admins = { execute: jest.fn().mockResolvedValue(adminIds) };
    const outbox = { emit: jest.fn() };
    const useCase = new CreateDoctorRequestUseCase(prisma as any, requests as any, admins as any, outbox as any);
    return { requests, outbox, useCase };
  }

  it('stores trimmed details and notifies every admin', async () => {
    const { requests, outbox, useCase } = setup();

    const result = await useCase.execute({ doctorName: '  Dr Ahmed ', clinicName: '   ' }, actor);

    expect(requests.create).toHaveBeenCalledWith(tx, expect.objectContaining({ patientId: 'patient-1', doctorName: 'Dr Ahmed', clinicName: null }));
    expect(outbox.emit).toHaveBeenCalledTimes(2);
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'NewDoctorRequestForAdmin', expect.objectContaining({ adminUserId: 'admin-1', doctorRequestId: 'req-1', patientId: 'patient-1' }));
    expect(result).toEqual(expect.objectContaining({ id: 'req-1', status: 'PENDING', doctorName: 'Dr Ahmed', createdAt: '2026-11-20T10:00:00.000Z' }));
  });

  it('rejects a request with no details', async () => {
    const { requests, useCase } = setup();

    await expect(useCase.execute({ doctorName: '  ', notes: '' }, actor)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(requests.create).not.toHaveBeenCalled();
  });

  it('rejects when the patient already has too many open requests', async () => {
    const { requests, outbox, useCase } = setup(5);

    await expect(useCase.execute({ doctorName: 'Dr Ahmed' }, actor)).rejects.toMatchObject({ code: 'DOCTOR_REQUEST_LIMIT_REACHED' });
    expect(requests.create).not.toHaveBeenCalled();
    expect(outbox.emit).not.toHaveBeenCalled();
  });
});
