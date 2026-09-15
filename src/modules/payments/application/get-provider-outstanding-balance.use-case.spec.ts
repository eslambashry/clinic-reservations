import { GetProviderOutstandingBalanceUseCase } from './get-provider-outstanding-balance.use-case';

function setup() {
  const prisma = {};
  const ledger = { findAllByProvider: jest.fn() };
  const useCase = new GetProviderOutstandingBalanceUseCase(prisma as any, ledger as any);
  return { prisma, ledger, useCase };
}

describe('GetProviderOutstandingBalanceUseCase', () => {
  it('sums EARNING entries into the outstanding balance', async () => {
    const { prisma, ledger, useCase } = setup();
    ledger.findAllByProvider.mockResolvedValue([
      { entry_type: 'EARNING', amount: { toString: () => '1000.00' }, related_payment_intent_id: 'intent-1' },
      { entry_type: 'EARNING', amount: { toString: () => '1500.00' }, related_payment_intent_id: 'intent-2' },
    ]);

    const result = await useCase.execute('DOCTOR' as any, 'doctor-1');

    expect(ledger.findAllByProvider).toHaveBeenCalledWith(prisma, { providerType: 'DOCTOR', providerId: 'doctor-1' });
    expect(result).toEqual({ providerType: 'DOCTOR', providerId: 'doctor-1', outstandingBalance: '2500.00' });
  });

  it('returns 0.00 for a provider with no ledger history', async () => {
    const { ledger, useCase } = setup();
    ledger.findAllByProvider.mockResolvedValue([]);

    const result = await useCase.execute('DOCTOR' as any, 'doctor-1');

    expect(result.outstandingBalance).toBe('0.00');
  });

  it('excludes COMMISSION_DEDUCTION entries from the balance', async () => {
    const { ledger, useCase } = setup();
    ledger.findAllByProvider.mockResolvedValue([
      { entry_type: 'EARNING', amount: { toString: () => '850.00' }, related_payment_intent_id: 'intent-1' },
      { entry_type: 'COMMISSION_DEDUCTION', amount: { toString: () => '30.00' }, related_payment_intent_id: 'intent-2' },
    ]);

    const result = await useCase.execute('DOCTOR' as any, 'doctor-1');

    expect(result.outstandingBalance).toBe('850.00');
  });
});
