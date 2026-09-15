import { RecordProviderPayoutUseCase } from './record-provider-payout.use-case';

const actor = { sub: 'admin-1', roleMembershipId: 'membership-1', roleCode: 'ADMIN', contextType: 'ADMIN', permissions: [] } as any;

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const ledger = { findAllByProvider: jest.fn(), create: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new RecordProviderPayoutUseCase(prisma as any, ledger as any, audit as any);
  return { tx, prisma, ledger, audit, useCase };
}

describe('RecordProviderPayoutUseCase', () => {
  it('rejects a non-positive amount before touching the database', async () => {
    const { prisma, useCase } = setup();

    await expect(
      useCase.execute({ providerType: 'DOCTOR' as any, providerId: 'doctor-1', amount: '0.00' }, actor),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a partial payout, writes a negative PAYOUT ledger entry, audits it, and returns the new outstanding balance', async () => {
    const { tx, ledger, audit, useCase } = setup();
    ledger.findAllByProvider.mockResolvedValue([
      { entry_type: 'EARNING', amount: { toString: () => '4500.00' }, related_payment_intent_id: 'intent-1' },
    ]);
    ledger.create.mockResolvedValue({ id: 'ledger-entry-1' });

    const result = await useCase.execute({ providerType: 'DOCTOR' as any, providerId: 'doctor-1', amount: '2500.00', note: 'Bank transfer #123' }, actor);

    expect(ledger.create).toHaveBeenCalledWith(tx, {
      providerType: 'DOCTOR',
      providerId: 'doctor-1',
      entryType: 'PAYOUT',
      amount: '-2500.00',
    });
    expect(audit.record).toHaveBeenCalledWith(tx, {
      actorUserId: 'admin-1',
      actorRoleMembershipId: 'membership-1',
      action: 'payments.provider_ledger.record_payout',
      resourceType: 'provider_ledger_entry',
      resourceId: 'ledger-entry-1',
      reasonCode: 'Bank transfer #123',
    });
    expect(result).toEqual({ ledgerEntryId: 'ledger-entry-1', outstandingBalance: '2000.00' });
  });

  it('rejects a payout larger than the current outstanding balance, without writing any ledger entry', async () => {
    const { ledger, useCase } = setup();
    ledger.findAllByProvider.mockResolvedValue([
      { entry_type: 'EARNING', amount: { toString: () => '1000.00' }, related_payment_intent_id: 'intent-1' },
    ]);

    await expect(
      useCase.execute({ providerType: 'DOCTOR' as any, providerId: 'doctor-1', amount: '1000.01' }, actor),
    ).rejects.toMatchObject({ code: 'PAYOUT_EXCEEDS_OUTSTANDING_BALANCE' });
    expect(ledger.create).not.toHaveBeenCalled();
  });

  it('allows a payout that exactly matches the outstanding balance, bringing it to 0.00', async () => {
    const { ledger, useCase } = setup();
    ledger.findAllByProvider.mockResolvedValue([
      { entry_type: 'EARNING', amount: { toString: () => '1000.00' }, related_payment_intent_id: 'intent-1' },
    ]);
    ledger.create.mockResolvedValue({ id: 'ledger-entry-2' });

    const result = await useCase.execute({ providerType: 'DOCTOR' as any, providerId: 'doctor-1', amount: '1000.00' }, actor);

    expect(result.outstandingBalance).toBe('0.00');
  });
});
