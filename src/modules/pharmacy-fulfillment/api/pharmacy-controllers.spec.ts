import { PharmacyOrdersController } from './pharmacy-orders.controller';
import { PharmacyAuditController } from './pharmacy-audit.controller';

const mk = (...names: string[]) => Object.fromEntries(names.map((n) => [n, jest.fn().mockResolvedValue(n)])) as any;

describe('PharmacyOrdersController', () => {
  const create = mk('execute', 'executeForProvider');
  const accept = mk('execute');
  const decline = mk('execute');
  const quote = mk('execute');
  const rejectOrder = mk('execute');
  const rejectSub = mk('execute');
  const fulfill = mk('execute');
  const complete = mk('execute');
  const confirm = mk('execute');
  const list = mk('execute');
  const get = mk('execute');
  const access = mk('get', 'review');
  const c = new PharmacyOrdersController(create, accept, decline, quote, rejectOrder, rejectSub, fulfill, complete, confirm, list, get, access);
  const user: any = { sub: 'u', contextType: 'PATIENT' };

  it('delegates each handler to its use case', async () => {
    await c.getPrescription('o', user);
    expect(access.get).toHaveBeenCalledWith('o', user);
    await c.reviewPrescription('o', { a: 1 } as any, user);
    expect(access.review).toHaveBeenCalledWith('o', { a: 1 }, user);
    await c.list({ limit: 1 } as any, user);
    expect(list.execute).toHaveBeenCalledWith({ limit: 1 }, user);
    await c.create({ x: 1 } as any, user);
    expect(create.execute).toHaveBeenCalledWith({ x: 1 }, user);
    await c.createForProvider({ y: 1 } as any, user);
    expect(create.executeForProvider).toHaveBeenCalledWith({ y: 1 }, user);
    await c.accept('o', user);
    await c.decline('o', user);
    await c.quote('o', { totalPrice: '1' } as any, user);
    await c.fulfill('o', {} as any, user);
    await c.complete('o', {} as any, user);
    await c.confirmReceipt('o', user);
    await c.get('o', user);
    for (const m of [accept, decline, quote, fulfill, complete, confirm, get]) {
      expect(m.execute).toHaveBeenCalledTimes(1);
    }
  });

  it('reject routes pharmacy staff to order rejection and others to substitution rejection', async () => {
    await c.reject('o', { reason: 'X' } as any, { ...user, contextType: 'PHARMACY_STAFF' });
    expect(rejectOrder.execute).toHaveBeenCalledTimes(1);
    expect(rejectSub.execute).not.toHaveBeenCalled();
    await c.reject('o', {} as any, user);
    expect(rejectSub.execute).toHaveBeenCalledWith('o', user);
  });
});

describe('PharmacyAuditController', () => {
  it('lists via use case', async () => {
    const uc = mk('execute');
    await new PharmacyAuditController(uc).list({} as any, { sub: 'u' } as any);
    expect(uc.execute).toHaveBeenCalled();
  });
});
