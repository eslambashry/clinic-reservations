import { GetLabOrderUseCase } from './get-lab-order.use-case';

const patient = { id: 'patient-1', firstName: 'Sara', lastName: 'Ali', phoneMasked: '***1234' };

function order(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'order-1',
    patient_id: 'patient-1',
    lab_branch_id: 'branch-1',
    prescription_id: null,
    status: 'REQUESTED',
    collection_type: 'VISIT',
    total_price: null,
    currency: null,
    appointment_at: null,
    prep_instructions: null,
    quoted_at: null,
    queue_number: null,
    booking_code: null,
    rejection_reason: null,
    rejection_note: null,
    rejected_at: null,
    recollection_required: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function setup() {
  const prisma = {} as any;
  const labOrders = { findById: jest.fn() };
  const labOrderItems = { findByOrderId: jest.fn().mockResolvedValue([]) };
  const labResults = { findByOrderId: jest.fn().mockResolvedValue([]) };
  const labOrderNotes = { findByOrderId: jest.fn().mockResolvedValue([]) };
  const testCatalog = { findByCodes: jest.fn().mockResolvedValue([]) };
  const getActiveRoleMembership = { execute: jest.fn() };
  const getUserSummary = { execute: jest.fn().mockResolvedValue(patient) };
  const getPrescriptionSummary = { execute: jest.fn() };
  const getCustodyEvents = { executeForOrders: jest.fn().mockResolvedValue(new Map()) };
  const mediaStorage = { upload: jest.fn(), getSignedUrl: jest.fn((url: string) => `${url}?signed=1`) };
  const useCase = new GetLabOrderUseCase(
    prisma,
    labOrders as any,
    labOrderItems as any,
    labResults as any,
    labOrderNotes as any,
    testCatalog as any,
    getActiveRoleMembership as any,
    getUserSummary as any,
    getPrescriptionSummary as any,
    getCustodyEvents as any,
    mediaStorage as any,
  );
  return { labOrders, labOrderItems, labResults, labOrderNotes, testCatalog, getActiveRoleMembership, getUserSummary, getPrescriptionSummary, getCustodyEvents, mediaStorage, useCase };
}

describe('GetLabOrderUseCase', () => {
  const patientActor = { sub: 'patient-1', roleMembershipId: 'm-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const staffActor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;

  it('returns the order to its owning patient', async () => {
    const { labOrders, useCase } = setup();
    labOrders.findById.mockResolvedValue(order());

    const result = await useCase.execute('order-1', patientActor);

    expect(result.id).toBe('order-1');
    expect(result.patient.id).toBe('patient-1');
  });

  it('returns the order to the assigned lab branch staff', async () => {
    const { labOrders, getActiveRoleMembership, useCase } = setup();
    labOrders.findById.mockResolvedValue(order());
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });

    const result = await useCase.execute('order-1', staffActor);

    expect(result.id).toBe('order-1');
  });

  it('404s a different patient (IDOR guard, hides existence)', async () => {
    const { labOrders, useCase } = setup();
    labOrders.findById.mockResolvedValue(order());

    await expect(useCase.execute('order-1', { ...patientActor, sub: 'other-patient' })).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s staff from a different branch', async () => {
    const { labOrders, getActiveRoleMembership, useCase } = setup();
    labOrders.findById.mockResolvedValue(order());
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'other-branch' });

    await expect(useCase.execute('order-1', staffActor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s a non-existent order', async () => {
    const { labOrders, useCase } = setup();
    labOrders.findById.mockResolvedValue(null);

    await expect(useCase.execute('order-1', patientActor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('enriches with the linked prescription\'s images when prescription_id is set', async () => {
    const { labOrders, getPrescriptionSummary, useCase } = setup();
    labOrders.findById.mockResolvedValue(order({ prescription_id: 'presc-1' }));
    getPrescriptionSummary.execute.mockResolvedValue({ id: 'presc-1', source: 'PATIENT_UPLOADED', status: 'ACCEPTED', expiresAt: null, doctorId: null, notes: null, images: [{ id: 'img-1', fileUrl: 'https://x/1.jpg', qualityCheckStatus: 'PASSED' }] });

    const result = await useCase.execute('order-1', patientActor);

    expect(result.prescriptionImages).toEqual([{ id: 'img-1', fileUrl: 'https://x/1.jpg' }]);
  });

  it('leaves prescriptionImages empty for a direct catalog-selection order', async () => {
    const { labOrders, getPrescriptionSummary, useCase } = setup();
    labOrders.findById.mockResolvedValue(order());

    const result = await useCase.execute('order-1', patientActor);

    expect(getPrescriptionSummary.execute).not.toHaveBeenCalled();
    expect(result.prescriptionImages).toEqual([]);
  });
});
