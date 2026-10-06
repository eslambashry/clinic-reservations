import 'reflect-metadata';
import { RecordResultUseCase } from './record-result.use-case';

function build() {
  const tx = {};
  const m: Record<string, any> = {
    prisma: { $transaction: jest.fn((fn: any) => fn(tx)) },
    labOrders: { findById: jest.fn(), setStatus: jest.fn() },
    items: { findById: jest.fn(), findByOrderId: jest.fn().mockResolvedValue([]), markRecorded: jest.fn() },
    results: { create: jest.fn() },
    membership: { execute: jest.fn().mockResolvedValue({ contextId: 'b1' }) },
    audit: { record: jest.fn() },
    outbox: { emit: jest.fn() },
    storage: { upload: jest.fn(async (f: any) => ({ url: `url-${f.originalName}`, fileId: 'f', filePath: 'p' })) },
  };
  const uc = new RecordResultUseCase(m.prisma, m.labOrders, m.items, m.results, m.membership, m.audit, m.outbox, m.storage);
  return { uc, m, tx };
}

const actor = { sub: 's1', roleMembershipId: 'rm', contextType: 'LAB_STAFF' } as any;
const file = (name: string, kb: number) => ({ buffer: Buffer.alloc(1), originalName: name, mimeType: 'application/pdf', sizeBytes: kb * 1024 }) as any;
const order = (o: any = {}) => ({ id: 'order-abcdef', lab_branch_id: 'b1', version: 2, status: 'IN_ANALYSIS', patient_id: 'p', doctor_id: null, created_by_user_id: null, ...o });

describe('RecordResultUseCase branches', () => {
  it('404s for a missing / foreign order after uploading', async () => {
    const { uc, m } = build();
    m.labOrders.findById.mockResolvedValue(order({ lab_branch_id: 'x' }));
    await expect(uc.execute('order-abcdef', { files: [file('a', 1)] }, actor)).rejects.toMatchObject({ httpStatus: 404 });
    expect(m.storage.upload).toHaveBeenCalledWith(expect.anything(), { folder: 'lab-results/order-abcdef', isPrivate: true });
  });

  it('422s when the order is not in analysis/results ready', async () => {
    const { uc, m } = build();
    m.labOrders.findById.mockResolvedValue(order({ status: 'REQUESTED' }));
    await expect(uc.execute('order-abcdef', { files: [] }, actor)).rejects.toMatchObject({ code: 'LAB_ORDER_NOT_IN_ANALYSIS' });
  });

  it('freeform: one row per file with real sizes, flips to RESULTS_READY and notifies patient and provider', async () => {
    const { uc, m } = build();
    m.labOrders.findById.mockResolvedValue(order({ doctor_id: 'doc', created_by_user_id: 'asst' }));
    const res = await uc.execute('order-abcdef', { files: [file('a', 3), file('b', 0)], fileLabel: ' Lbl ' }, actor);
    expect(res).toEqual({ labOrderId: 'order-abcdef', status: 'RESULTS_READY' });
    expect(m.results.create).toHaveBeenCalledTimes(2);
    expect(m.results.create).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({ fileLabel: 'Lbl', fileUrl: 'url-a', sizeKb: 3 }));
    expect(m.results.create).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({ sizeKb: 1 }));
    expect(m.outbox.emit).toHaveBeenCalledWith(expect.anything(), 'LabResultReadyForProvider', { labOrderId: 'order-abcdef', recipientUserId: 'asst' });
  });

  it('freeform metadata-only call uses default label, caller sizeKb (min 1) and does not re-flip RESULTS_READY', async () => {
    const { uc, m } = build();
    m.labOrders.findById.mockResolvedValue(order({ status: 'RESULTS_READY' }));
    const res = await uc.execute('order-abcdef', { files: [], sizeKb: 0.2 }, actor);
    expect(res.status).toBe('RESULTS_READY');
    expect(m.results.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fileLabel: 'RESULT_ABCDEF.pdf', fileUrl: undefined, sizeKb: 1 }));
    expect(m.labOrders.setStatus).not.toHaveBeenCalled();
    m.results.create.mockClear();
    await uc.execute('order-abcdef', { files: [] }, actor);
    expect(m.results.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sizeKb: 1 }));
  });

  it('freeform on an order that has item rows demands an itemId', async () => {
    const { uc, m } = build();
    m.labOrders.findById.mockResolvedValue(order());
    m.items.findByOrderId.mockResolvedValue([{ id: 'i1' }]);
    await expect(uc.execute('order-abcdef', { files: [] }, actor)).rejects.toMatchObject({ code: 'LAB_ORDER_ITEM_ID_REQUIRED' });
  });

  it('itemised: 404 on unknown/foreign item and 409 when already recorded', async () => {
    const { uc, m } = build();
    m.labOrders.findById.mockResolvedValue(order());
    m.items.findById.mockResolvedValue(null);
    await expect(uc.execute('order-abcdef', { itemId: 'i1', files: [] }, actor)).rejects.toMatchObject({ httpStatus: 404 });
    m.items.findById.mockResolvedValue({ id: 'i1', lab_order_id: 'other' });
    await expect(uc.execute('order-abcdef', { itemId: 'i1', files: [] }, actor)).rejects.toMatchObject({ httpStatus: 404 });
    m.items.findById.mockResolvedValue({ id: 'i1', lab_order_id: 'order-abcdef', result_state: 'RECORDED' });
    await expect(uc.execute('order-abcdef', { itemId: 'i1', files: [] }, actor)).rejects.toMatchObject({ code: 'LAB_ORDER_ITEM_RESULT_ALREADY_RECORDED' });
  });

  it('itemised: first file attaches to the item, extras become freeform rows; completes the order when all items recorded', async () => {
    const { uc, m } = build();
    m.labOrders.findById.mockResolvedValue(order({ doctor_id: 'doc' }));
    m.items.findById.mockResolvedValue({ id: 'i1', version: 4, lab_order_id: 'order-abcdef', result_state: 'PENDING', test_name: 'CBC' });
    m.items.findByOrderId.mockResolvedValue([{ id: 'i1', result_state: 'PENDING' }, { id: 'i2', result_state: 'RECORDED' }]);
    const res = await uc.execute('order-abcdef', { itemId: 'i1', files: [file('a', 2), file('b', 5)] }, actor);
    expect(res.status).toBe('RESULTS_READY');
    expect(m.results.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ itemId: 'i1', fileUrl: 'url-a', sizeKb: 2 }));
    expect(m.results.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fileUrl: 'url-b', sizeKb: 5 }));
    expect(m.items.markRecorded).toHaveBeenCalledWith(expect.anything(), 'i1', 4);
    expect(m.outbox.emit).toHaveBeenCalledWith(expect.anything(), 'LabResultReadyForProvider', { labOrderId: 'order-abcdef', recipientUserId: 'doc' });
    expect(m.audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reasonCode: 'CBC' }));
  });

  it('itemised: stays IN_ANALYSIS while other items are pending, honours custom label', async () => {
    const { uc, m } = build();
    m.labOrders.findById.mockResolvedValue(order());
    m.items.findById.mockResolvedValue({ id: 'i1', version: 1, lab_order_id: 'order-abcdef', result_state: 'PENDING', test_name: 'CBC' });
    m.items.findByOrderId.mockResolvedValue([{ id: 'i1' }, { id: 'i2', result_state: 'PENDING' }]);
    const res = await uc.execute('order-abcdef', { itemId: 'i1', files: [file('a', 1)], fileLabel: 'X' }, actor);
    expect(res.status).toBe('IN_ANALYSIS');
    expect(m.labOrders.setStatus).not.toHaveBeenCalled();
    expect(m.results.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fileLabel: 'X' }));
  });
});
