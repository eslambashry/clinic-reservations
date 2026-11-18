import { FinanceController } from './finance.controller';

describe('FinanceController', () => {
  const summary = { execute: jest.fn().mockResolvedValue('sum') };
  const ledger = { execute: jest.fn().mockResolvedValue('led') };
  const controller = new FinanceController(summary as any, ledger as any);

  it('summary delegates', async () => {
    const q = { from: 'x' } as any;
    await expect(controller.summary(q)).resolves.toBe('sum');
    expect(summary.execute).toHaveBeenCalledWith(q);
  });

  it('ledger delegates', async () => {
    const q = { limit: 5 } as any;
    await expect(controller.ledger(q)).resolves.toBe('led');
    expect(ledger.execute).toHaveBeenCalledWith(q);
  });
});
