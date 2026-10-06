import { encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { ListProviderLedgerEntriesUseCase } from './list-provider-ledger-entries.use-case';
import { ListWalletTransactionsUseCase } from './list-wallet-transactions.use-case';

const dec = (n: string) => ({ toFixed: () => n }) as any;

describe('ListProviderLedgerEntriesUseCase branches', () => {
  const lrow = (i: number) => ({
    id: `l-${i}`,
    provider_type: 'DOCTOR',
    provider_id: 'p',
    entry_type: 'COMMISSION',
    amount: dec('10.00'),
    created_at: new Date(`2026-01-0${i}T00:00:00Z`),
  });
  const setup = (rows: any[], total = rows.length) => {
    const ledger = { list: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(total) };
    return { ledger, useCase: new ListProviderLedgerEntriesUseCase({} as any, ledger as any) };
  };

  it('offset mode', async () => {
    const { ledger, useCase } = setup([lrow(1)], 7);
    const res = await useCase.execute({ page: 3, limit: 2 });
    expect(ledger.list).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ skip: 4, limit: 2 }));
    expect(res).toMatchObject({ nextCursor: null, page: 3, totalCount: 7 });
    expect(res.entries[0]).toMatchObject({ amount: '10.00', createdAt: '2026-01-01T00:00:00.000Z' });
  });

  it('cursor mode with cursor and next page', async () => {
    const { ledger, useCase } = setup([lrow(1), lrow(2), lrow(3)]);
    const cursor = encodeCursor({ c: '2025-12-01T00:00:00.000Z', i: 'l-0' });
    const res = await useCase.execute({ cursor, limit: 2, providerType: 'DOCTOR' as any });
    expect(ledger.list.mock.calls[0][1].cursor).toEqual({ createdAt: new Date('2025-12-01T00:00:00.000Z'), id: 'l-0' });
    expect(res.entries).toHaveLength(2);
    expect(res.nextCursor).toBe(encodeCursor({ c: lrow(2).created_at.toISOString(), i: 'l-2' }));
  });

  it('cursor mode default limit, no cursor, last page', async () => {
    const { ledger, useCase } = setup([lrow(1)]);
    const res = await useCase.execute({});
    expect(ledger.list.mock.calls[0][1]).toMatchObject({ cursor: undefined, limit: 51 });
    expect(res.nextCursor).toBeNull();
  });
});

describe('ListWalletTransactionsUseCase branches', () => {
  const trow = (o: any = {}) => ({
    id: 't1',
    type: 'REFUND',
    status: 'COMPLETED',
    amount: dec('5.00'),
    resulting_balance: dec('9.00'),
    payment_intent_id: null,
    appointment_id: 'ap1',
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...o,
  });
  const setup = (opts: { wallet?: any; txs?: any[]; appts?: any[] } = {}) => {
    const wallets = { findByUserId: jest.fn().mockResolvedValue('wallet' in opts ? opts.wallet : { id: 'w1' }) };
    const walletTx = { list: jest.fn().mockResolvedValue(opts.txs ?? []) };
    const prisma = { appointment: { findMany: jest.fn().mockResolvedValue(opts.appts ?? []) } };
    return { wallets, walletTx, prisma, useCase: new ListWalletTransactionsUseCase(prisma as any, wallets as any, walletTx as any) };
  };
  const appt = (o: any) => ({
    id: 'ap1',
    patient_id: 'pat',
    cancelled_by: null,
    affiliation: { doctor: { user: { first_name: 'A', last_name: 'B' } } },
    ...o,
  });

  it('empty result when the user has no wallet', async () => {
    const { useCase, walletTx } = setup({ wallet: null });
    expect(await useCase.execute({ userId: 'u', limit: 10 })).toEqual({ transactions: [], nextCursor: null });
    expect(walletTx.list).not.toHaveBeenCalled();
  });

  it('skips the appointment lookup when no tx has an appointment; null balance and cursor decode', async () => {
    const { useCase, prisma, walletTx } = setup({ txs: [trow({ appointment_id: null, resulting_balance: null, type: 'TOP_UP' })] });
    const cursor = encodeCursor({ c: '2025-01-01T00:00:00.000Z', i: 'x' });
    const res = await useCase.execute({ userId: 'u', limit: 10, cursor });
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    expect(walletTx.list.mock.calls[0][1].cursor).toEqual({ createdAt: '2025-01-01T00:00:00.000Z', id: 'x' });
    expect(res.transactions[0]).toMatchObject({ resultingBalance: null, doctorName: null, cancelledBy: null });
    expect(res.nextCursor).toBeNull();
  });

  it.each([
    ['PATIENT', 'pat', 'PATIENT'],
    ['DOCTOR', 'doc', 'DOCTOR'],
    [null, null, null],
  ])('refund cancelledBy %s', async (_l, cancelledBy, expected) => {
    const { useCase } = setup({ txs: [trow()], appts: [appt({ cancelled_by: cancelledBy })] });
    const res = await useCase.execute({ userId: 'u', limit: 10 });
    expect(res.transactions[0]).toMatchObject({ doctorName: 'A B', cancelledBy: expected });
  });

  it('non-refund hides cancelledBy; blank names yield null doctorName; full page yields nextCursor', async () => {
    const { useCase } = setup({
      txs: [trow({ type: 'PAYMENT' })],
      appts: [appt({ cancelled_by: 'pat', affiliation: { doctor: { user: { first_name: null, last_name: null } } } })],
    });
    const res = await useCase.execute({ userId: 'u', limit: 1 });
    expect(res.transactions[0]).toMatchObject({ cancelledBy: null, doctorName: null });
    expect(res.nextCursor).toBe(encodeCursor({ c: '2026-01-01T00:00:00.000Z', i: 't1' }));
  });

  it('transaction whose appointment row is missing falls back to nulls', async () => {
    const { useCase } = setup({ txs: [trow()], appts: [appt({ id: 'other' })] });
    const res = await useCase.execute({ userId: 'u', limit: 10 });
    expect(res.transactions[0]).toMatchObject({ doctorName: null, cancelledBy: null });
  });
});
