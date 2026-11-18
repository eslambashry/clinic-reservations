import { DomainError } from '../../core/errors/domain-errors';
import { PolicyConfigsController } from './policy-configs.controller';

describe('PolicyConfigsController', () => {
  const list = { execute: jest.fn().mockResolvedValue({ policies: [] }) };
  const upsert = { execute: jest.fn().mockResolvedValue({ id: 'p' }) };
  const controller = new PolicyConfigsController(list as any, upsert as any);
  const user: any = { sub: 'admin' };

  it('list passes the region', async () => {
    expect(await controller.list({ regionCode: 'EG' } as any)).toEqual({ policies: [] });
    expect(list.execute).toHaveBeenCalledWith('EG');
  });

  it('upsert parses the policy type and forwards actor', async () => {
    expect(await controller.upsert('COMMISSION_RATE', { regionCode: 'EG', value: { ratePercent: 1 } } as any, user)).toEqual({ id: 'p' });
    expect(upsert.execute).toHaveBeenCalledWith({ policyType: 'COMMISSION_RATE', regionCode: 'EG', value: { ratePercent: 1 } }, user);
  });

  it('upsert rejects an unknown policy type without calling the use case', () => {
    upsert.execute.mockClear();
    expect(() => controller.upsert('BOGUS', { value: {} } as any, user)).toThrow(DomainError);
    expect(upsert.execute).not.toHaveBeenCalled();
  });
});
