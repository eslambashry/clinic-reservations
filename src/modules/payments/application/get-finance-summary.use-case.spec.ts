import { Prisma } from '@prisma/client';
import { GetFinanceSummaryUseCase } from './get-finance-summary.use-case';

describe('GetFinanceSummaryUseCase', () => {
  const prisma = { db: true } as any;
  const setup = (splits: Map<any, Prisma.Decimal>, refund: Prisma.Decimal) => {
    const splitRepo = { sumByType: jest.fn().mockResolvedValue(splits) };
    const refundRepo = { sumCompleted: jest.fn().mockResolvedValue(refund) };
    return { splitRepo, refundRepo, useCase: new GetFinanceSummaryUseCase(prisma, splitRepo as any, refundRepo as any) };
  };

  it('formats totals with two decimals and parses the date range', async () => {
    const { useCase, splitRepo, refundRepo } = setup(
      new Map<any, Prisma.Decimal>([
        ['COMMISSION', new Prisma.Decimal('10.5')],
        ['PROVIDER_SHARE', new Prisma.Decimal('89.5')],
      ]),
      new Prisma.Decimal('3'),
    );
    const result = await useCase.execute({ from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' });

    const range = { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-02-01T00:00:00.000Z') };
    expect(splitRepo.sumByType).toHaveBeenCalledWith(prisma, range);
    expect(refundRepo.sumCompleted).toHaveBeenCalledWith(prisma, range);
    expect(result).toMatchObject({ commissionTotal: '10.50', providerShareTotal: '89.50', refundTotal: '3.00' });
    expect(typeof result.currency).toBe('string');
  });

  it('defaults missing split types to 0.00 and leaves the range open', async () => {
    const { useCase, splitRepo } = setup(new Map(), new Prisma.Decimal(0));
    const result = await useCase.execute({});
    expect(splitRepo.sumByType).toHaveBeenCalledWith(prisma, { from: undefined, to: undefined });
    expect(result).toMatchObject({ commissionTotal: '0.00', providerShareTotal: '0.00', refundTotal: '0.00' });
  });
});
