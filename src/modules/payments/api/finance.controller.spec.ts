import { FinanceController } from './finance.controller';

describe('FinanceController', () => {
  const summary = { execute: jest.fn().mockResolvedValue('sum') };
  const ledger = { execute: jest.fn() };
  const controller = new FinanceController(summary as any, ledger as any);

  it('summary delegates', async () => {
    const q = { from: 'x' } as any;
    await expect(controller.summary(q)).resolves.toBe('sum');
    expect(summary.execute).toHaveBeenCalledWith(q);
  });

  it('no longer exposes the provider ledger endpoint (disabled)', () => {
    expect((controller as any).ledger).toBeUndefined();
  });
});
