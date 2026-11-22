import { Prisma } from '@prisma/client';
import { GetFinanceSummaryUseCase } from './get-finance-summary.use-case';

describe('GetFinanceSummaryUseCase', () => {
  const prisma = { db: true } as any;
  const dec = (v: string) => new Prisma.Decimal(v);
  const setup = (refund: Prisma.Decimal) => {
    const splitRepo = { sumByType: jest.fn() };
    const refundRepo = { sumCompleted: jest.fn().mockResolvedValue(refund) };
    const intents = { sumCapturedAppointmentFees: jest.fn().mockResolvedValue(dec('24')) };
    const wallets = { sumBalances: jest.fn().mockResolvedValue(dec('100.5')) };
    const walletTx = { sumCompletedTopUps: jest.fn().mockResolvedValue(dec('300')) };
    const withdrawals = {
      sumByStatus: jest.fn().mockImplementation((_db: unknown, status: string) => Promise.resolve(status === 'PENDING' ? dec('50') : dec('70.25'))),
    };
    const useCase = new GetFinanceSummaryUseCase(prisma, splitRepo as any, refundRepo as any, intents as any, wallets as any, walletTx as any, withdrawals as any);
    return { splitRepo, refundRepo, intents, wallets, walletTx, withdrawals, useCase };
  };

  it('formats totals with two decimals and parses the date range', async () => {
    const { useCase, refundRepo, intents, walletTx, withdrawals, wallets } = setup(dec('3'));
    const result = await useCase.execute({ from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' });

    const range = { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-02-01T00:00:00.000Z') };
    expect(refundRepo.sumCompleted).toHaveBeenCalledWith(prisma, range);
    expect(intents.sumCapturedAppointmentFees).toHaveBeenCalledWith(prisma, range);
    expect(walletTx.sumCompletedTopUps).toHaveBeenCalledWith(prisma, range);
    expect(withdrawals.sumByStatus).toHaveBeenCalledWith(prisma, 'PENDING', range);
    expect(wallets.sumBalances).toHaveBeenCalledWith(prisma);
    expect(result).toMatchObject({
      serviceFeeTotal: '24.00',
      walletBalancesTotal: '100.50',
      topUpTotal: '300.00',
      pendingWithdrawalsTotal: '50.00',
      completedWithdrawalsTotal: '70.25',
      refundTotal: '3.00',
    });
    expect(typeof result.currency).toBe('string');
  });

  it('leaves the range open when none is given and no longer reads commission splits', async () => {
    const { useCase, splitRepo, refundRepo } = setup(dec('0'));
    const result = await useCase.execute({});
    expect(refundRepo.sumCompleted).toHaveBeenCalledWith(prisma, { from: undefined, to: undefined });
    expect(splitRepo.sumByType).not.toHaveBeenCalled();
    expect(result.refundTotal).toBe('0.00');
  });
});
