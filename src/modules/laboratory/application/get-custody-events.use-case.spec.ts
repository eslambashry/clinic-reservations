import { GetCustodyEventsUseCase } from './get-custody-events.use-case';

function setup() {
  const audit = { listByResource: jest.fn() };
  const getUserSummary = { execute: jest.fn() };
  const useCase = new GetCustodyEventsUseCase(audit as any, getUserSummary as any);
  return { audit, getUserSummary, useCase };
}

const db = {} as any;

describe('GetCustodyEventsUseCase', () => {
  it('returns an empty map without querying audit_logs when no order ids are given', async () => {
    const { audit, useCase } = setup();

    const result = await useCase.executeForOrders(db, []);

    expect(result.size).toBe(0);
    expect(audit.listByResource).not.toHaveBeenCalled();
  });

  it('decodes this module\'s own action encoding, resolves actor names, groups by order, and returns oldest-first', async () => {
    const { audit, getUserSummary, useCase } = setup();
    audit.listByResource.mockResolvedValue([
      { id: 'log-2', action: 'laboratory.lab-order.sample-collected', resource_id: 'order-1', actor_user_id: 'staff-1', occurred_at: new Date('2026-01-02T00:00:00Z'), reason_code: null },
      { id: 'log-1', action: 'laboratory.lab-order.request-received', resource_id: 'order-1', actor_user_id: null, occurred_at: new Date('2026-01-01T00:00:00Z'), reason_code: null },
    ]);
    getUserSummary.execute.mockResolvedValue({ id: 'staff-1', firstName: 'أحمد', lastName: 'فتحي', phoneMasked: '***1' });

    const result = await useCase.executeForOrders(db, ['order-1']);

    const events = result.get('order-1')!;
    expect(events.map((e) => e.id)).toEqual(['log-1', 'log-2']); // oldest first
    expect(events[1].actorName).toBe('أحمد فتحي');
    expect(events[0].actorName).toBeNull();
    expect(events[1].type).toBe('SAMPLE_COLLECTED');
  });

  it('drops audit_logs rows whose action was not written by this module', async () => {
    const { audit, useCase } = setup();
    audit.listByResource.mockResolvedValue([{ id: 'log-1', action: 'pharmacy-fulfillment.pharmacy-order.create', resource_id: 'order-1', actor_user_id: null, occurred_at: new Date(), reason_code: null }]);

    const result = await useCase.executeForOrders(db, ['order-1']);

    expect(result.get('order-1') ?? []).toHaveLength(0);
  });

  it('resolves each unique actor id only once across many events', async () => {
    const { audit, getUserSummary, useCase } = setup();
    audit.listByResource.mockResolvedValue([
      { id: 'log-1', action: 'laboratory.lab-order.note-added', resource_id: 'order-1', actor_user_id: 'staff-1', occurred_at: new Date(), reason_code: null },
      { id: 'log-2', action: 'laboratory.lab-order.note-added', resource_id: 'order-1', actor_user_id: 'staff-1', occurred_at: new Date(), reason_code: null },
    ]);
    getUserSummary.execute.mockResolvedValue({ id: 'staff-1', firstName: 'أحمد', lastName: null, phoneMasked: '***1' });

    await useCase.executeForOrders(db, ['order-1']);

    expect(getUserSummary.execute).toHaveBeenCalledTimes(1);
  });
});
