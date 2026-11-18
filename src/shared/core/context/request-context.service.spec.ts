import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  const svc = new RequestContextService();

  it('is empty outside a run scope', () => {
    expect(svc.get()).toBeUndefined();
    expect(svc.correlationId).toBeUndefined();
  });

  it('exposes the context inside run and returns the callback result', async () => {
    const result = await svc.run({ correlationId: 'c1' }, async () => {
      await Promise.resolve();
      expect(svc.get()).toEqual({ correlationId: 'c1' });
      expect(svc.correlationId).toBe('c1');
      return 42;
    });
    expect(result).toBe(42);
    expect(svc.correlationId).toBeUndefined();
  });
});
