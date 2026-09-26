import { ListWalletTransactionsUseCase } from './list-wallet-transactions.use-case';

function buildTransaction(overrides: Partial<any> = {}) {
  return {
    id: 'tx-1',
    type: 'APPOINTMENT_PAYMENT',
    status: 'COMPLETED',
    amount: { toFixed: () => '150.00' },
    resulting_balance: { toFixed: () => '850.00' },
    payment_intent_id: 'pi-1',
    appointment_id: null,
    created_at: new Date('2026-09-01T10:00:00Z'),
    ...overrides,
  };
}

describe('ListWalletTransactionsUseCase', () => {
  function setup() {
    const prisma = { appointment: { findMany: jest.fn() } };
    const wallets = { findByUserId: jest.fn() };
    const walletTransactions = { list: jest.fn() };
    const useCase = new ListWalletTransactionsUseCase(prisma as any, wallets as any, walletTransactions as any);
    return { prisma, wallets, walletTransactions, useCase };
  }

  it('returns an empty page when the user has no wallet yet', async () => {
    const { wallets, useCase } = setup();
    wallets.findByUserId.mockResolvedValue(null);

    const result = await useCase.execute({ userId: 'user-1', limit: 20 });

    expect(result).toEqual({ transactions: [], nextCursor: null });
  });

  it('leaves doctorName/cancelledBy null when a transaction has no appointment_id', async () => {
    const { prisma, wallets, walletTransactions, useCase } = setup();
    wallets.findByUserId.mockResolvedValue({ id: 'wallet-1' });
    walletTransactions.list.mockResolvedValue([buildTransaction()]);

    const result = await useCase.execute({ userId: 'user-1', limit: 20 });

    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    expect(result.transactions[0]).toMatchObject({ doctorName: null, cancelledBy: null });
  });

  it('enriches an appointment-linked transaction with the doctor name', async () => {
    const { prisma, wallets, walletTransactions, useCase } = setup();
    wallets.findByUserId.mockResolvedValue({ id: 'wallet-1' });
    walletTransactions.list.mockResolvedValue([buildTransaction({ appointment_id: 'appt-1' })]);
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-1',
        patient_id: 'user-1',
        cancelled_by: null,
        affiliation: { doctor: { user: { first_name: 'Mona', last_name: 'Fahmy' } } },
      },
    ]);

    const result = await useCase.execute({ userId: 'user-1', limit: 20 });

    expect(result.transactions[0]).toMatchObject({ doctorName: 'Mona Fahmy', cancelledBy: null });
  });

  it('marks a REFUND row with who cancelled — the patient themself', async () => {
    const { prisma, wallets, walletTransactions, useCase } = setup();
    wallets.findByUserId.mockResolvedValue({ id: 'wallet-1' });
    walletTransactions.list.mockResolvedValue([buildTransaction({ type: 'REFUND', appointment_id: 'appt-1' })]);
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-1',
        patient_id: 'user-1',
        cancelled_by: 'user-1',
        affiliation: { doctor: { user: { first_name: 'Mona', last_name: 'Fahmy' } } },
      },
    ]);

    const result = await useCase.execute({ userId: 'user-1', limit: 20 });

    expect(result.transactions[0].cancelledBy).toBe('PATIENT');
  });

  it('marks a REFUND row with who cancelled — the doctor/clinic', async () => {
    const { prisma, wallets, walletTransactions, useCase } = setup();
    wallets.findByUserId.mockResolvedValue({ id: 'wallet-1' });
    walletTransactions.list.mockResolvedValue([buildTransaction({ type: 'REFUND', appointment_id: 'appt-1' })]);
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-1',
        patient_id: 'user-1',
        cancelled_by: 'staff-1',
        affiliation: { doctor: { user: { first_name: 'Mona', last_name: 'Fahmy' } } },
      },
    ]);

    const result = await useCase.execute({ userId: 'user-1', limit: 20 });

    expect(result.transactions[0].cancelledBy).toBe('DOCTOR');
  });

  it('never reports cancelledBy for a non-REFUND row even if the appointment was cancelled', async () => {
    const { prisma, wallets, walletTransactions, useCase } = setup();
    wallets.findByUserId.mockResolvedValue({ id: 'wallet-1' });
    walletTransactions.list.mockResolvedValue([buildTransaction({ type: 'APPOINTMENT_PAYMENT', appointment_id: 'appt-1' })]);
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-1',
        patient_id: 'user-1',
        cancelled_by: 'user-1',
        affiliation: { doctor: { user: { first_name: 'Mona', last_name: 'Fahmy' } } },
      },
    ]);

    const result = await useCase.execute({ userId: 'user-1', limit: 20 });

    expect(result.transactions[0].cancelledBy).toBeNull();
  });
});
