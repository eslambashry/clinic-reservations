import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetAcceptedPrescriptionForOrderUseCase } from './get-accepted-prescription-for-order.use-case';
import { GetPrescriptionUseCase } from './get-prescription.use-case';
import { GetProviderPrescriptionUseCase } from './get-provider-prescription.use-case';

const tx = {} as any;

describe('GetAcceptedPrescriptionForOrderUseCase additional branches', () => {
  function setup() {
    const prescriptions = { findById: jest.fn(), lockForReview: jest.fn() };
    const items = { findByPrescriptionId: jest.fn().mockResolvedValue([]) };
    const images = { findByPrescriptionId: jest.fn().mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]) };
    return { prescriptions, items, images, useCase: new GetAcceptedPrescriptionForOrderUseCase(prescriptions as any, items as any, images as any) };
  }
  const ok = { id: 'rx', patient_id: 'pt', doctor_id: 'doc', source: 'DOCTOR_ISSUED', document_type: 'PRESCRIPTION', status: 'ACCEPTED' };

  it('execute rejects lab referrals', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ ...ok, document_type: 'LAB_REFERRAL' });
    await expect(useCase.execute(tx, 'rx', 'pt')).rejects.toMatchObject({ code: 'DOCUMENT_NOT_A_PRESCRIPTION' });
  });

  it('execute filters out items without quantity or without any drug identity', async () => {
    const { prescriptions, items, useCase } = setup();
    prescriptions.findById.mockResolvedValue(ok);
    items.findByPrescriptionId.mockResolvedValue([
      { id: 'a', drug_code: 'D', drug_name_free_text: null, quantity: 1 },
      { id: 'b', drug_code: null, drug_name_free_text: 'x', quantity: 2 },
      { id: 'c', drug_code: 'D', drug_name_free_text: null, quantity: null },
      { id: 'd', drug_code: null, drug_name_free_text: null, quantity: 3 },
    ]);
    const result = await useCase.execute(tx, 'rx', 'pt');
    expect(result.items).toEqual([{ id: 'a', drugCode: 'D', quantity: 1 }, { id: 'b', drugCode: null, quantity: 2 }]);
    expect(result.imageCount).toBe(2);
  });

  it.each([
    ['missing', null],
    ['other patient', { ...ok, patient_id: 'zz' }],
    ['other doctor', { ...ok, doctor_id: 'zz' }],
    ['patient-uploaded', { ...ok, source: 'PATIENT_UPLOAD' }],
    ['lab referral', { ...ok, document_type: 'LAB_REFERRAL' }],
  ])('executeForProvider 404s for %s', async (_n, row) => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue(row);
    await expect(useCase.executeForProvider(tx, 'rx', 'pt', 'doc')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('executeForProvider requires ACCEPTED status', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ ...ok, status: 'PENDING_DOCTOR_APPROVAL' });
    await expect(useCase.executeForProvider(tx, 'rx', 'pt', 'doc')).rejects.toMatchObject({ code: 'PRESCRIPTION_NOT_ACCEPTED' });
  });

  it('executeForProvider returns fulfillable items and image count', async () => {
    const { prescriptions, items, useCase } = setup();
    prescriptions.findById.mockResolvedValue(ok);
    items.findByPrescriptionId.mockResolvedValue([
      { id: 'a', drug_code: 'D', drug_name_free_text: null, quantity: 1 },
      { id: 'b', drug_code: null, drug_name_free_text: null, quantity: 1 },
      { id: 'c', drug_code: null, drug_name_free_text: 'n', quantity: null },
    ]);
    const result = await useCase.executeForProvider(tx, 'rx', 'pt', 'doc');
    expect(prescriptions.lockForReview).toHaveBeenCalledWith(tx, 'rx');
    expect(result).toEqual({ prescriptionId: 'rx', items: [{ id: 'a', drugCode: 'D', quantity: 1 }], imageCount: 2 });
  });
});

describe('GetPrescriptionUseCase additional branches', () => {
  function setup(row: any) {
    const prescriptions = { findById: jest.fn().mockResolvedValue(row) };
    const images = { findByPrescriptionId: jest.fn().mockResolvedValue([{ id: 'im', file_url: 'f', quality_check_status: 'PASSED' }]) };
    const items = { findByPrescriptionId: jest.fn().mockResolvedValue([{ id: 'it', drug_code: null, drug_name_free_text: 'x', dose: 'd', frequency: 'f' }]) };
    const reviews = { findByPrescriptionId: jest.fn().mockResolvedValue([{ id: 'rv', decision: 'ACCEPTED', reason_code: null, reviewed_at: new Date('2026-01-01T00:00:00Z') }]) };
    const storage = { getSignedUrl: jest.fn().mockReturnValue('signed') };
    return new GetPrescriptionUseCase({} as any, prescriptions as any, images as any, items as any, reviews as any, storage as any);
  }
  const rx = { id: 'rx', patient_id: 'pt', status: 'ACCEPTED', source: 'PATIENT_UPLOAD', notes: null, document_type: 'PRESCRIPTION' };

  it('owner patient gets signed detail', async () => {
    const detail = await setup(rx).execute('rx', { sub: 'pt', contextType: 'PATIENT' } as any);
    expect(detail.images[0].fileUrl).toBe('signed');
    expect(detail.reviews[0].reviewedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('hides unapproved provider drafts from patients but not admins', async () => {
    const draft = { ...rx, status: 'PENDING_DOCTOR_APPROVAL' };
    await expect(setup(draft).execute('rx', { sub: 'pt', contextType: 'PATIENT' } as any)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup(draft).execute('rx', { sub: 'a', contextType: 'ADMIN' } as any)).resolves.toBeDefined();
  });

  it('404s for non-owners and missing rows', async () => {
    await expect(setup(rx).execute('rx', { sub: 'other', contextType: 'PATIENT' } as any)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup(null).execute('rx', { sub: 'a', contextType: 'ADMIN' } as any)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('executeForOrder reads within the given tx and rejects drafts / non-prescriptions / missing', async () => {
    await expect(setup(rx).executeForOrder(tx, 'rx')).resolves.toMatchObject({ prescriptionId: 'rx' });
    await expect(setup({ ...rx, status: 'PENDING_DOCTOR_APPROVAL' }).executeForOrder(tx, 'rx')).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup({ ...rx, document_type: 'LAB_REFERRAL' }).executeForOrder(tx, 'rx')).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup(null).executeForOrder(tx, 'rx')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('GetProviderPrescriptionUseCase additional branches', () => {
  const row = {
    id: 'rx', patient_id: 'pt', doctor_id: 'doc', created_by_user_id: 'asst', created_by_role: 'CLINIC_STAFF', decided_by_user_id: null,
    appointment_id: null, status: 'REJECTED', source: 'DOCTOR_ISSUED', document_type: 'PRESCRIPTION', notes: null, version: 1,
    approved_at: null, rejected_at: new Date('2026-01-02T00:00:00Z'), rejection_reason: 'no',
  };
  function setup(r: any) {
    const prescriptions = { findById: jest.fn().mockResolvedValue(r) };
    const items = { findByPrescriptionId: jest.fn().mockResolvedValue([{ id: 'it', drug_name_free_text: 'x', dose: 'd', frequency: 'f', duration_days: 1, quantity: 2 }]) };
    const images = { findByPrescriptionId: jest.fn().mockResolvedValue([{ id: 'im', file_url: 'f', quality_check_status: 'PASSED' }]) };
    const scope = { execute: jest.fn().mockResolvedValue({ doctorUserId: 'doc' }) };
    const uc = new GetProviderPrescriptionUseCase({} as any, prescriptions as any, items as any, images as any, scope as any, { getSignedUrl: jest.fn().mockReturnValue('s') } as any);
    return uc;
  }

  it('maps rejected rows with null approvedAt, items and signed images', async () => {
    const out = await setup(row).execute('rx', { sub: 'doc', contextType: 'DOCTOR' } as any);
    expect(out.approvedAt).toBeNull();
    expect(out.rejectedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(out.items[0]).toMatchObject({ drugName: 'x', quantity: 2 });
    expect(out.images[0].fileUrl).toBe('s');
  });

  it('404s for non-provider roles, other doctors, lab referrals, and other assistants', async () => {
    await expect(setup(row).execute('rx', { sub: 'p', contextType: 'PATIENT' } as any)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup(null).execute('rx', { sub: 'doc', contextType: 'DOCTOR' } as any)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup({ ...row, doctor_id: 'x' }).execute('rx', { sub: 'doc', contextType: 'DOCTOR' } as any)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup({ ...row, document_type: 'LAB_REFERRAL' }).execute('rx', { sub: 'doc', contextType: 'DOCTOR' } as any)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup(row).execute('rx', { sub: 'other', contextType: 'CLINIC_STAFF' } as any)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup(row).execute('rx', { sub: 'asst', contextType: 'CLINIC_STAFF' } as any)).resolves.toBeDefined();
  });
});
