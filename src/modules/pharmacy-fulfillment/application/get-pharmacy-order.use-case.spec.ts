import { GetPharmacyOrderUseCase } from './get-pharmacy-order.use-case';

function setup() {
  const prisma = {} as any;
  const pharmacyOrders = { findById: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const getUserSummary = { execute: jest.fn() };
  const getPrescriptionSummary = { execute: jest.fn() };
  const useCase = new GetPharmacyOrderUseCase(prisma, pharmacyOrders as any, getActiveRoleMembership as any, getUserSummary as any, getPrescriptionSummary as any);
  return { pharmacyOrders, getActiveRoleMembership, getUserSummary, getPrescriptionSummary, useCase };
}

describe('GetPharmacyOrderUseCase', () => {
  const patientActor = { sub: 'patient-1', roleMembershipId: 'm-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const staffActor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;

  const order = {
    id: 'order-1',
    status: 'ACCEPTED',
    fulfillment_type: 'PICKUP',
    patient_id: 'patient-1',
    prescription_id: 'presc-1',
    pharmacy_branch_id: 'branch-1',
    created_at: new Date('2026-08-29T10:00:00Z'),
    updated_at: new Date('2026-08-29T10:05:00Z'),
    total_price: { toString: () => '225.00' },
    currency: 'EGP',
    estimated_ready_minutes: 45,
    staff_note: 'all available',
    quoted_at: new Date('2026-08-29T10:05:00Z'),
    rejection_reason: null,
    rejection_note: null,
    rejected_at: null,
  };
  const patient = { id: 'patient-1', firstName: 'Sara', lastName: 'Ali', phoneMasked: '***1234' };
  const prescription = { id: 'presc-1', source: 'PATIENT_UPLOADED', status: 'ACCEPTED', expiresAt: null, doctorId: null, images: [] };

  it('returns the order for the owning patient, with a quote block', async () => {
    const { pharmacyOrders, getUserSummary, getPrescriptionSummary, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(order);
    getUserSummary.execute.mockResolvedValue(patient);
    getPrescriptionSummary.execute.mockResolvedValue(prescription);

    const result = await useCase.execute('order-1', patientActor);

    expect(result.patient).toEqual(patient);
    expect(result.quote).toEqual({ totalPrice: '225.00', currency: 'EGP', estimatedReadyMinutes: 45, note: 'all available', quotedAt: '2026-08-29T10:05:00.000Z' });
    expect(result.rejection).toBeNull();
  });

  it('returns the order for the assigned pharmacy branch staff', async () => {
    const { pharmacyOrders, getActiveRoleMembership, getUserSummary, getPrescriptionSummary, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(order);
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    getUserSummary.execute.mockResolvedValue(patient);
    getPrescriptionSummary.execute.mockResolvedValue(prescription);

    const result = await useCase.execute('order-1', staffActor);

    expect(result.id).toBe('order-1');
  });

  it('404s for pharmacy staff from a different branch', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(order);
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'other-branch' });

    await expect(useCase.execute('order-1', staffActor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s for a patient who does not own the order', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ ...order, patient_id: 'someone-else' });

    await expect(useCase.execute('order-1', patientActor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('returns a null quote before one has been submitted', async () => {
    const { pharmacyOrders, getUserSummary, getPrescriptionSummary, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue({ ...order, total_price: null, currency: null, quoted_at: null, staff_note: null });
    getUserSummary.execute.mockResolvedValue(patient);
    getPrescriptionSummary.execute.mockResolvedValue(prescription);

    const result = await useCase.execute('order-1', patientActor);

    expect(result.quote).toBeNull();
  });

  it('resolves a DOCTOR_ISSUED prescription\'s doctorName via a second lookup', async () => {
    const { pharmacyOrders, getUserSummary, getPrescriptionSummary, useCase } = setup();
    pharmacyOrders.findById.mockResolvedValue(order);
    getUserSummary.execute.mockImplementation(async (_tx: unknown, id: string) =>
      id === 'patient-1' ? patient : { id: 'doctor-1', firstName: 'Omar', lastName: 'Hassan', phoneMasked: '***9999' },
    );
    getPrescriptionSummary.execute.mockResolvedValue({ ...prescription, source: 'DOCTOR_ISSUED', doctorId: 'doctor-1' });

    const result = await useCase.execute('order-1', patientActor);

    expect(result.prescription.doctorName).toBe('Omar Hassan');
  });
});
