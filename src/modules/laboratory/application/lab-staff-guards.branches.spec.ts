import 'reflect-metadata';
import { AddOperationalNoteUseCase } from './add-operational-note.use-case';
import { CollectSampleUseCase } from './collect-sample.use-case';
import { DispatchCourierUseCase } from './dispatch-courier.use-case';
import { RecordArrivalUseCase } from './record-arrival.use-case';
import { RecordResultDeliveryUseCase } from './record-result-delivery.use-case';
import { RejectLabOrderUseCase } from './reject-lab-order.use-case';
import { RejectSampleUseCase } from './reject-sample.use-case';
import { RequestRecollectionUseCase } from './request-recollection.use-case';
import { RescheduleVisitUseCase } from './reschedule-visit.use-case';
import { SetCriticalFlagUseCase } from './set-critical-flag.use-case';
import { StartAnalysisUseCase } from './start-analysis.use-case';
import { SubmitLabQuoteUseCase } from './submit-lab-quote.use-case';
import { RecordResultUseCase } from './record-result.use-case';

type Mocks = Record<string, any>;

/** Builds a use case with auto-mocked (every property a jest.fn) dependencies keyed by their @Inject token name. */
function build(cls: any): { uc: any; m: Mocks; tx: any } {
  const tx = {};
  const m: Mocks = {};
  const params: { index: number; param: any }[] = Reflect.getMetadata('self:paramtypes', cls) ?? [];
  const args: any[] = [];
  for (const { index, param } of params) {
    const name = typeof param === 'function' ? param.name : String(param);
    const target: Record<string, any> = {};
    m[name] = new Proxy(target, {
      get: (t, p) => (typeof p === 'string' ? (t[p] ??= jest.fn()) : undefined),
    });
    args[index] = m[name];
  }
  m.PrismaService.$transaction = jest.fn((fn: any) => fn(tx));
  m.GetActiveRoleMembershipUseCase.execute.mockResolvedValue({ roleMembershipId: 'rm', contextId: 'branch-1' });
  m.GetCustodyEventsUseCase?.executeForOrders.mockResolvedValue(new Map());
  return { uc: new cls(...args), m, tx };
}

const actor = { sub: 'staff-1', roleMembershipId: 'rm', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;
const future = new Date(Date.now() + 86_400_000).toISOString();
const input = { reason: 'r', note: 'n', body: 'b', recipientName: 'N', summary: 's', isCritical: true, appointmentAt: future };

const cases: [string, any, (uc: any, id: string) => Promise<any>][] = [
  ['AddOperationalNote', AddOperationalNoteUseCase, (uc, id) => uc.execute(id, input, actor)],
  ['CollectSample', CollectSampleUseCase, (uc, id) => uc.execute(id, undefined, actor)],
  ['DispatchCourier', DispatchCourierUseCase, (uc, id) => uc.execute(id, undefined, actor)],
  ['RecordArrival', RecordArrivalUseCase, (uc, id) => uc.execute(id, undefined, actor)],
  ['RecordResultDelivery', RecordResultDeliveryUseCase, (uc, id) => uc.execute(id, input, actor)],
  ['RejectLabOrder', RejectLabOrderUseCase, (uc, id) => uc.execute(id, input, actor)],
  ['RejectSample', RejectSampleUseCase, (uc, id) => uc.execute(id, input, actor)],
  ['RequestRecollection', RequestRecollectionUseCase, (uc, id) => uc.execute(id, input, actor)],
  ['RescheduleVisit', RescheduleVisitUseCase, (uc, id) => uc.execute(id, input, actor)],
  ['SetCriticalFlag', SetCriticalFlagUseCase, (uc, id) => uc.execute(id, 'res-1', input, actor)],
  ['StartAnalysis', StartAnalysisUseCase, (uc, id) => uc.execute(id, undefined, actor)],
  ['SubmitLabQuote', SubmitLabQuoteUseCase, (uc, id) => uc.execute(id, { totalPrice: '10', prepInstructions: 'p', queueNumber: 1, appointmentAt: future }, actor)],
];

describe.each(cases)('%s staff guards', (_n, cls, run) => {
  it('403s without an active branch membership', async () => {
    const { uc, m } = build(cls);
    m.GetActiveRoleMembershipUseCase.execute.mockResolvedValue(null);
    await expect(run(uc, 'o1')).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('403s when the membership has no branch context', async () => {
    const { uc, m } = build(cls);
    m.GetActiveRoleMembershipUseCase.execute.mockResolvedValue({ roleMembershipId: 'rm', contextId: null });
    await expect(run(uc, 'o1')).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('404s when the order is missing', async () => {
    const { uc, m } = build(cls);
    m.LabOrderRepository.findById.mockResolvedValue(null);
    await expect(run(uc, 'o1')).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s when the order belongs to another branch', async () => {
    const { uc, m } = build(cls);
    m.LabOrderRepository.findById.mockResolvedValue({ id: 'o1', lab_branch_id: 'other', version: 1, status: 'REQUESTED' });
    await expect(run(uc, 'o1')).rejects.toMatchObject({ httpStatus: 404 });
  });
});

describe('input validation', () => {
  it.each([
    ['AddOperationalNote', AddOperationalNoteUseCase, { body: '   ' }],
    ['RecordResultDelivery', RecordResultDeliveryUseCase, { recipientName: '  ' }],
    ['RejectLabOrder', RejectLabOrderUseCase, { reason: ' ' }],
    ['RejectSample', RejectSampleUseCase, { reason: ' ' }],
    ['RequestRecollection', RequestRecollectionUseCase, { reason: ' ' }],
    ['RescheduleVisit', RescheduleVisitUseCase, { appointmentAt: '2000-01-01T00:00:00Z' }],
    ['RescheduleVisit', RescheduleVisitUseCase, { appointmentAt: 'not-a-date' }],
  ] as [string, any, any][])('%s rejects bad input %p', async (_n, cls, bad) => {
    const { uc, m } = build(cls);
    await expect(uc.execute('o1', { ...input, ...bad }, actor)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(m.PrismaService.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [{ totalPrice: '0' }],
    [{ totalPrice: 'abc' }],
    [{ prepInstructions: '  ' }],
    [{ queueNumber: 0 }],
    [{ queueNumber: 1.5 }],
    [{ appointmentAt: 'nope' }],
    [{ appointmentAt: '2000-01-01T00:00:00Z' }],
  ])('SubmitLabQuote rejects %p', async (bad) => {
    const { uc } = build(SubmitLabQuoteUseCase);
    const good = { totalPrice: '10', prepInstructions: 'p', queueNumber: 1, appointmentAt: future };
    await expect(uc.execute('o1', { ...good, ...bad }, actor)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('success-path branches', () => {
  const order = (o: any = {}) => ({
    id: 'o1',
    lab_branch_id: 'branch-1',
    version: 3,
    status: 'REQUESTED',
    patient_id: 'pat',
    doctor_id: null,
    created_by_user_id: null,
    appointment_at: new Date(),
    ...o,
  });

  it('SubmitLabQuote splits price across items and notifies the provider (falling back to doctor_id)', async () => {
    const { uc, m } = build(SubmitLabQuoteUseCase);
    m.LabOrderRepository.findById.mockResolvedValue(order({ doctor_id: 'doc' }));
    m.LabOrderItemRepository.findByOrderId.mockResolvedValue([{}, {}, {}]);
    const res = await uc.execute('o1', { totalPrice: '10', prepInstructions: ' p ', queueNumber: 2, appointmentAt: future }, actor);
    expect(res).toEqual({ labOrderId: 'o1', status: 'QUOTED' });
    expect(m.LabOrderItemRepository.setUnitPrice).toHaveBeenCalledWith(expect.anything(), 'o1', '3.33');
    expect(m.LabOrderRepository.submitQuote).toHaveBeenCalledWith(expect.anything(), 'o1', 3, expect.objectContaining({ prepInstructions: 'p' }));
    expect(m.OutboxService.emit).toHaveBeenCalledTimes(2);
    expect(m.OutboxService.emit).toHaveBeenLastCalledWith(expect.anything(), 'LabOrderStatusChanged', expect.objectContaining({ recipientUserId: 'doc' }));
  });

  it('SubmitLabQuote with no items and no doctor skips split and provider notification', async () => {
    const { uc, m } = build(SubmitLabQuoteUseCase);
    m.LabOrderRepository.findById.mockResolvedValue(order());
    m.LabOrderItemRepository.findByOrderId.mockResolvedValue([]);
    await uc.execute('o1', { totalPrice: '10', prepInstructions: 'p', queueNumber: 2, appointmentAt: future }, actor);
    expect(m.LabOrderItemRepository.setUnitPrice).not.toHaveBeenCalled();
    expect(m.OutboxService.emit).toHaveBeenCalledTimes(1);
  });

  it('RejectLabOrder notifies the creating assistant when present, else the doctor; note overrides audit reason', async () => {
    const { uc, m } = build(RejectLabOrderUseCase);
    m.LabOrderRepository.findById.mockResolvedValue(order({ doctor_id: 'doc', created_by_user_id: 'asst' }));
    await uc.execute('o1', { reason: ' r ', note: ' n ' }, actor);
    expect(m.LabOrderRepository.rejectOrder).toHaveBeenCalledWith(expect.anything(), 'o1', 3, { reason: 'r', note: 'n' });
    expect(m.AuditService.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reasonCode: 'n' }));
    expect(m.OutboxService.emit).toHaveBeenLastCalledWith(expect.anything(), 'LabOrderStatusChanged', expect.objectContaining({ recipientUserId: 'asst' }));
    m.OutboxService.emit.mockClear();
    m.LabOrderRepository.findById.mockResolvedValue(order({ doctor_id: 'doc' }));
    await uc.execute('o1', { reason: 'r' }, actor);
    expect(m.AuditService.record).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ reasonCode: 'r' }));
    expect(m.OutboxService.emit).toHaveBeenLastCalledWith(expect.anything(), 'LabOrderStatusChanged', expect.objectContaining({ recipientUserId: 'doc' }));
  });

  it('RescheduleVisit refuses an order with no priced appointment and one with a live sample', async () => {
    const { uc, m } = build(RescheduleVisitUseCase);
    m.LabOrderRepository.findById.mockResolvedValue(order({ status: 'QUOTED', appointment_at: null }));
    await expect(uc.execute('o1', input, actor)).rejects.toMatchObject({ code: 'LAB_ORDER_NO_QUOTE_TO_RESCHEDULE' });
    m.LabOrderRepository.findById.mockResolvedValue(order({ status: 'QUOTED' }));
    m.GetCustodyEventsUseCase.executeForOrders.mockResolvedValue(new Map([['o1', [{ type: 'SAMPLE_COLLECTED' }]]]));
    await expect(uc.execute('o1', input, actor)).rejects.toMatchObject({ code: 'LAB_ORDER_SAMPLE_ALREADY_LIVE' });
  });

  it('SetCriticalFlag 404s on a missing / foreign result and 409s when already reviewed', async () => {
    const { uc, m } = build(SetCriticalFlagUseCase);
    m.LabOrderRepository.findById.mockResolvedValue(order());
    m.LabResultRepository.findById.mockResolvedValue(null);
    await expect(uc.execute('o1', 'r1', input, actor)).rejects.toMatchObject({ httpStatus: 404 });
    m.LabResultRepository.findById.mockResolvedValue({ id: 'r1', lab_order_id: 'zzz', review_state: 'UNREVIEWED' });
    await expect(uc.execute('o1', 'r1', input, actor)).rejects.toMatchObject({ httpStatus: 404 });
    m.LabResultRepository.findById.mockResolvedValue({ id: 'r1', lab_order_id: 'o1', review_state: 'REVIEWED' });
    await expect(uc.execute('o1', 'r1', input, actor)).rejects.toMatchObject({ code: 'LAB_RESULT_ALREADY_REVIEWED' });
    expect(m.LabResultRepository.setCriticalCall).not.toHaveBeenCalled();
  });
});

describe('RecordResultUseCase guards', () => {
  it('403s without a branch membership', async () => {
    const { uc, m } = build(RecordResultUseCase);
    m.GetActiveRoleMembershipUseCase.execute.mockResolvedValue(null);
    await expect(uc.execute('o1', {}, actor)).rejects.toMatchObject({ httpStatus: 403 });
    m.GetActiveRoleMembershipUseCase.execute.mockResolvedValue({ contextId: null });
    await expect(uc.execute('o1', {}, actor)).rejects.toMatchObject({ httpStatus: 403 });
  });
});
