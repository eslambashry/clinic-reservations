import { GetLabOrderUseCase } from './get-lab-order.use-case';
import { ListLabOrdersUseCase } from './list-lab-orders.use-case';

const patient = { id: 'patient-1', firstName: 'Sara', lastName: 'Ali', phoneMasked: '***1234' };

function order(o: Record<string, any> = {}) {
  return {
    id: 'order-1',
    patient_id: 'patient-1',
    lab_branch_id: 'branch-1',
    prescription_id: null,
    doctor_id: 'doctor-user-1',
    created_by_user_id: 'assistant-1',
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
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...o,
  };
}

function deps() {
  return {
    prisma: {} as any,
    labOrders: { findById: jest.fn(), findForPatient: jest.fn(), findForBranch: jest.fn(), findByDoctorId: jest.fn() },
    items: { findByOrderId: jest.fn().mockResolvedValue([]) },
    results: { findByOrderId: jest.fn().mockResolvedValue([]) },
    notes: { findByOrderId: jest.fn().mockResolvedValue([]) },
    membership: { execute: jest.fn() },
    scope: { execute: jest.fn().mockResolvedValue({ doctorUserId: 'doctor-user-1' }) },
    userSummary: { execute: jest.fn().mockResolvedValue(patient) },
    prescription: { execute: jest.fn().mockResolvedValue(null) },
    custody: { executeForOrders: jest.fn().mockResolvedValue(new Map()) },
    storage: { getSignedUrl: jest.fn((u: string) => `${u}?s`) },
  };
}

const args = (d: ReturnType<typeof deps>) =>
  [d.prisma, d.labOrders, d.items, d.results, d.notes, d.membership, d.scope, d.userSummary, d.prescription, d.custody, d.storage] as any[];

const act = (contextType: string, sub: string) => ({ sub, contextType, roleCode: contextType, permissions: [] }) as any;

const note = (id: string, author: string) => ({ id, author_id: author, body: 'b', created_at: new Date('2026-01-02T00:00:00Z') });

describe('GetLabOrderUseCase branches', () => {
  const make = () => {
    const d = deps();
    return { d, uc: new (GetLabOrderUseCase as any)(...args(d)) as GetLabOrderUseCase };
  };

  it('404s when the order does not exist', async () => {
    const { d, uc } = make();
    d.labOrders.findById.mockResolvedValue(null);
    await expect(uc.execute('x', act('PATIENT', 'patient-1'))).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s staff with no membership / different branch / null context', async () => {
    const { d, uc } = make();
    d.labOrders.findById.mockResolvedValue(order());
    d.membership.execute.mockResolvedValue(null);
    await expect(uc.execute('o', act('LAB_STAFF', 's'))).rejects.toMatchObject({ httpStatus: 404 });
    d.membership.execute.mockResolvedValue({ contextId: null });
    await expect(uc.execute('o', act('LAB_STAFF', 's'))).rejects.toMatchObject({ httpStatus: 404 });
    d.membership.execute.mockResolvedValue({ contextId: 'other' });
    await expect(uc.execute('o', act('LAB_STAFF', 's'))).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s a stranger actor type (no provider scope lookup)', async () => {
    const { d, uc } = make();
    d.labOrders.findById.mockResolvedValue(order());
    await expect(uc.execute('o', act('ADMIN', 'a'))).rejects.toMatchObject({ httpStatus: 404 });
    expect(d.scope.execute).not.toHaveBeenCalled();
  });

  it('lets the originating doctor and own-submission assistant in, others not', async () => {
    const { d, uc } = make();
    d.labOrders.findById.mockResolvedValue(order());
    await expect(uc.execute('o', act('DOCTOR', 'doctor-user-1'))).resolves.toMatchObject({ id: 'order-1' });
    await expect(uc.execute('o', act('CLINIC_STAFF', 'assistant-1'))).resolves.toMatchObject({ id: 'order-1' });
    await expect(uc.execute('o', act('CLINIC_STAFF', 'assistant-2'))).rejects.toMatchObject({ httpStatus: 404 });
    d.scope.execute.mockResolvedValue({ doctorUserId: 'someone-else' });
    await expect(uc.execute('o', act('DOCTOR', 'doctor-user-1'))).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s when the patient summary is missing', async () => {
    const { d, uc } = make();
    d.labOrders.findById.mockResolvedValue(order());
    d.userSummary.execute.mockResolvedValue(null);
    await expect(uc.execute('o', act('PATIENT', 'patient-1'))).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('loads prescription, names note authors (fallbacks) and signs result urls', async () => {
    const { d, uc } = make();
    d.labOrders.findById.mockResolvedValue(order({ prescription_id: 'rx-1' }));
    d.prescription.execute.mockResolvedValue({ id: 'rx-1', images: [{ id: 'i1', fileUrl: 'u' }] });
    d.notes.findByOrderId.mockResolvedValue([note('n1', 'a1'), note('n2', 'a1'), note('n3', 'a2'), note('n4', 'a3')]);
    d.userSummary.execute.mockImplementation(async (_p: any, id: string) => {
      if (id === 'patient-1') return patient;
      if (id === 'a1') return { id: 'a1', firstName: 'Nora', lastName: 'K' };
      if (id === 'a2') return { id: 'a2', firstName: null, lastName: null };
      return null;
    });
    d.results.findByOrderId.mockResolvedValue([
      { id: 'r1', file_url: 'f1', lab_order_id: 'order-1', uploaded_at: new Date('2026-01-01T00:00:00Z') },
      { id: 'r2', file_url: null, lab_order_id: 'order-1', uploaded_at: new Date('2026-01-01T00:00:00Z') },
    ]);
    const res: any = await uc.execute('o', act('PATIENT', 'patient-1'));
    expect(d.prescription.execute).toHaveBeenCalledWith(d.prisma, 'rx-1');
    expect(d.userSummary.execute).toHaveBeenCalledTimes(4);
    expect(d.storage.getSignedUrl).toHaveBeenCalledTimes(1);
    const text = JSON.stringify(res);
    expect(text).toContain('Nora K');
    expect(text).toContain('f1?s');
    expect(text).toContain('موظف');
  });
});

describe('ListLabOrdersUseCase branches', () => {
  const make = () => {
    const d = deps();
    return { d, uc: new (ListLabOrdersUseCase as any)(...args(d)) as ListLabOrdersUseCase };
  };

  it('403s unsupported actor types and staff with null contextId', async () => {
    const { d, uc } = make();
    await expect(uc.execute({}, act('ADMIN', 'a'))).rejects.toMatchObject({ httpStatus: 403 });
    d.membership.execute.mockResolvedValue({ contextId: null });
    await expect(uc.execute({}, act('LAB_STAFF', 's'))).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('applies sort asc, status filter, max-limit clamp and decodes cursor', async () => {
    const { d, uc } = make();
    d.labOrders.findForPatient.mockResolvedValue([]);
    await uc.execute({ sort: 'createdAt:asc', status: 'REQUESTED' as any, limit: 999 }, act('PATIENT', 'patient-1'));
    expect(d.labOrders.findForPatient).toHaveBeenCalledWith(d.prisma, 'patient-1', expect.objectContaining({ sortDirection: 'asc', status: 'REQUESTED', limit: 51 }));
  });

  it('enriches with prescription, authors, signed results; nextCursor from last kept row', async () => {
    const { d, uc } = make();
    const rows = [order({ id: 'o1', prescription_id: 'rx' }), order({ id: 'o2' }), order({ id: 'o3' })];
    d.labOrders.findForPatient.mockResolvedValue(rows);
    d.prescription.execute.mockResolvedValue({ id: 'rx', images: [] });
    d.notes.findByOrderId.mockImplementation(async (_p: any, id: string) => (id === 'o1' ? [note('n1', 'a1'), note('n2', 'a2'), note('n3', 'a3')] : []));
    d.userSummary.execute.mockImplementation(async (_p: any, id: string) => {
      if (id === 'a1') return { id: 'a1', firstName: 'Nora', lastName: 'K' };
      if (id === 'a2') return { id: 'a2', firstName: null, lastName: null };
      if (id === 'a3') return null;
      return patient;
    });
    d.results.findByOrderId.mockImplementation(async (_p: any, id: string) => (id === 'o1' ? [{ id: 'r1', file_url: 'f', lab_order_id: 'o1', uploaded_at: new Date('2026-01-01T00:00:00Z') }, { id: 'r2', file_url: null, lab_order_id: 'o1', uploaded_at: new Date('2026-01-01T00:00:00Z') }] : []));
    const res = await uc.execute({ limit: 2 }, act('PATIENT', 'patient-1'));
    expect(res.orders).toHaveLength(2);
    expect(res.nextCursor).not.toBeNull();
    expect(d.storage.getSignedUrl).toHaveBeenCalledTimes(1);
    const text = JSON.stringify(res.orders[0]);
    expect(text).toContain('Nora K');
    expect(text).toContain('موظف');
  });

  it('throws when an order references a missing patient', async () => {
    const { d, uc } = make();
    d.labOrders.findForPatient.mockResolvedValue([order()]);
    d.userSummary.execute.mockResolvedValue(null);
    await expect(uc.execute({}, act('PATIENT', 'patient-1'))).rejects.toThrow(/missing patient/);
  });
});
