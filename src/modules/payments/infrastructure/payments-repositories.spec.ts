import { Prisma } from '@prisma/client';
import { PaymentAttemptRepository } from './payment-attempt.repository';
import { PaymentIntentRepository } from './payment-intent.repository';
import { PaymentSplitRepository } from './payment-split.repository';
import { ProviderLedgerRepository } from './provider-ledger.repository';
import { RefundRepository } from './refund.repository';
import { WalletTransactionRepository } from './wallet-transaction.repository';
import { WalletRepository } from './wallet.repository';

const d = (v: number | string) => new Prisma.Decimal(v);

describe('WalletRepository', () => {
  const repo = new WalletRepository();
  const wallet = { id: 'w1', user_id: 'u1', currency: 'EGP' };

  it('findByUserId / findById query unique keys', async () => {
    const db: any = { wallet: { findUnique: jest.fn().mockResolvedValue(wallet) } };
    await expect(repo.findByUserId(db, 'u1')).resolves.toBe(wallet);
    expect(db.wallet.findUnique).toHaveBeenCalledWith({ where: { user_id: 'u1' } });
    await repo.findById(db, 'w1');
    expect(db.wallet.findUnique).toHaveBeenLastCalledWith({ where: { id: 'w1' } });
  });

  it('getOrCreate returns the existing wallet without creating', async () => {
    const db: any = { wallet: { findUnique: jest.fn().mockResolvedValue(wallet), create: jest.fn() } };
    await expect(repo.getOrCreate(db, 'u1', 'EGP')).resolves.toBe(wallet);
    expect(db.wallet.create).not.toHaveBeenCalled();
  });

  it('getOrCreate creates a zero-balance wallet when missing', async () => {
    const db: any = { wallet: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(wallet) } };
    await expect(repo.getOrCreate(db, 'u1', 'EGP')).resolves.toBe(wallet);
    expect(db.wallet.create).toHaveBeenCalledWith({ data: { user_id: 'u1', currency: 'EGP', balance: 0 } });
  });

  it('getOrCreate re-reads after a P2002 race', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    const db: any = {
      wallet: { findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(wallet), create: jest.fn().mockRejectedValue(err) },
    };
    await expect(repo.getOrCreate(db, 'u1', 'EGP')).resolves.toBe(wallet);
  });

  it('getOrCreate rethrows P2002 if the re-read still finds nothing', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    const db: any = { wallet: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockRejectedValue(err) } };
    await expect(repo.getOrCreate(db, 'u1', 'EGP')).rejects.toBe(err);
  });

  it('getOrCreate rethrows other known errors and non-Prisma errors', async () => {
    const other = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2003', clientVersion: 'x' });
    const db: any = { wallet: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockRejectedValue(other) } };
    await expect(repo.getOrCreate(db, 'u1', 'EGP')).rejects.toBe(other);
    db.wallet.create.mockRejectedValue(new Error('boom'));
    await expect(repo.getOrCreate(db, 'u1', 'EGP')).rejects.toThrow('boom');
  });

  it('credit increments atomically', async () => {
    const db: any = { wallet: { update: jest.fn().mockResolvedValue(wallet) } };
    await repo.credit(db, 'w1', '10.00');
    expect(db.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balance: { increment: '10.00' }, version: { increment: 1 } },
    });
  });

  it('debit is conditional and reports success by row count', async () => {
    const db: any = { wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await expect(repo.debit(db, 'w1', '5.00')).resolves.toBe(true);
    expect(db.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'w1', balance: { gte: '5.00' } },
      data: { balance: { decrement: '5.00' }, version: { increment: 1 } },
    });
    db.wallet.updateMany.mockResolvedValue({ count: 0 });
    await expect(repo.debit(db, 'w1', '5.00')).resolves.toBe(false);
  });
});

describe('PaymentSplitRepository', () => {
  const repo = new PaymentSplitRepository();

  it('create maps fields', async () => {
    const db: any = { paymentSplit: { create: jest.fn().mockResolvedValue({}) } };
    await repo.create(db, { paymentIntentId: 'i', payeeType: 'PROVIDER' as any, payeeId: 'p', amount: '1.00', type: 'COMMISSION' as any });
    expect(db.paymentSplit.create).toHaveBeenCalledWith({
      data: { payment_intent_id: 'i', payee_type: 'PROVIDER', payee_id: 'p', amount: '1.00', type: 'COMMISSION' },
    });
  });

  it('sumByType without a range uses an empty where and defaults null sums to zero', async () => {
    const db: any = {
      paymentSplit: {
        groupBy: jest.fn().mockResolvedValue([
          { type: 'COMMISSION', _sum: { amount: d('5') } },
          { type: 'PROVIDER_SHARE', _sum: { amount: null } },
        ]),
      },
    };
    const map = await repo.sumByType(db, {});
    expect(db.paymentSplit.groupBy).toHaveBeenCalledWith({ by: ['type'], where: {}, _sum: { amount: true } });
    expect(map.get('COMMISSION' as any)!.toFixed(2)).toBe('5.00');
    expect(map.get('PROVIDER_SHARE' as any)!.toFixed(2)).toBe('0.00');
  });

  it('sumByType applies from and to', async () => {
    const db: any = { paymentSplit: { groupBy: jest.fn().mockResolvedValue([]) } };
    const from = new Date('2026-01-01');
    const to = new Date('2026-02-01');
    await repo.sumByType(db, { from, to });
    expect(db.paymentSplit.groupBy.mock.calls[0][0].where).toEqual({ created_at: { gte: from, lte: to } });
    await repo.sumByType(db, { from });
    expect(db.paymentSplit.groupBy.mock.calls[1][0].where).toEqual({ created_at: { gte: from } });
    await repo.sumByType(db, { to });
    expect(db.paymentSplit.groupBy.mock.calls[2][0].where).toEqual({ created_at: { lte: to } });
  });
});

describe('RefundRepository', () => {
  const repo = new RefundRepository();

  it('create maps fields', async () => {
    const db: any = { refund: { create: jest.fn().mockResolvedValue({}) } };
    await repo.create(db, { paymentIntentId: 'i', amount: '3.00', reason: 'r', status: 'COMPLETED' as any });
    expect(db.refund.create).toHaveBeenCalledWith({ data: { payment_intent_id: 'i', amount: '3.00', reason: 'r', status: 'COMPLETED' } });
  });

  it('sumCompleted without range, null sum -> zero', async () => {
    const db: any = { refund: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) } };
    const total = await repo.sumCompleted(db, {});
    expect(total.toFixed(2)).toBe('0.00');
    expect(db.refund.aggregate).toHaveBeenCalledWith({ where: { status: 'COMPLETED' }, _sum: { amount: true } });
  });

  it('sumCompleted with from/to', async () => {
    const db: any = { refund: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: d('7') } }) } };
    const from = new Date('2026-01-01');
    const to = new Date('2026-02-01');
    const total = await repo.sumCompleted(db, { from, to });
    expect(total.toFixed(2)).toBe('7.00');
    expect(db.refund.aggregate.mock.calls[0][0].where).toEqual({ status: 'COMPLETED', created_at: { gte: from, lte: to } });
    await repo.sumCompleted(db, { from });
    expect(db.refund.aggregate.mock.calls[1][0].where.created_at).toEqual({ gte: from });
    await repo.sumCompleted(db, { to });
    expect(db.refund.aggregate.mock.calls[2][0].where.created_at).toEqual({ lte: to });
  });
});

describe('PaymentIntentRepository', () => {
  const repo = new PaymentIntentRepository();
  const base = { payerUserId: 'u', payableType: 'APPOINTMENT' as any, payableId: 'a', amount: '1.00', currency: 'EGP', idempotencyKey: 'k' };

  it('create defaults method to PAY_AT_CLINIC', async () => {
    const db: any = { paymentIntent: { create: jest.fn().mockResolvedValue({}) } };
    await repo.create(db, base);
    expect(db.paymentIntent.create.mock.calls[0][0].data).toMatchObject({ method: 'PAY_AT_CLINIC', status: 'CREATED', payer_user_id: 'u' });
  });

  it('create uses the given method and full amount', async () => {
    const db: any = { paymentIntent: { create: jest.fn().mockResolvedValue({}) } };
    await repo.create(db, { ...base, method: 'CARD', fullAmount: '9.00' });
    expect(db.paymentIntent.create.mock.calls[0][0].data).toMatchObject({ method: 'CARD', full_amount: '9.00' });
  });

  it('findById queries by id', async () => {
    const db: any = { paymentIntent: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(repo.findById(db, 'i')).resolves.toBeNull();
    expect(db.paymentIntent.findUnique).toHaveBeenCalledWith({ where: { id: 'i' } });
  });

  it.each([
    ['markCaptured', 'CAPTURED', 'CREATED'],
    ['markCancelled', 'CANCELLED', 'CREATED'],
  ] as const)('%s is an optimistic conditional update', async (method, status, from) => {
    const db: any = { paymentIntent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await expect((repo as any)[method](db, 'i', 2)).resolves.toBe(true);
    expect(db.paymentIntent.updateMany).toHaveBeenCalledWith({
      where: { id: 'i', version: 2, status: from },
      data: { status, version: { increment: 1 } },
    });
    db.paymentIntent.updateMany.mockResolvedValue({ count: 0 });
    await expect((repo as any)[method](db, 'i', 2)).resolves.toBe(false);
  });

  it('markRefunded only transitions from CAPTURED', async () => {
    const db: any = { paymentIntent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await expect(repo.markRefunded(db, 'i', 3, 'PARTIALLY_REFUNDED')).resolves.toBe(true);
    expect(db.paymentIntent.updateMany).toHaveBeenCalledWith({
      where: { id: 'i', version: 3, status: 'CAPTURED' },
      data: { status: 'PARTIALLY_REFUNDED', version: { increment: 1 } },
    });
    db.paymentIntent.updateMany.mockResolvedValue({ count: 0 });
    await expect(repo.markRefunded(db, 'i', 3, 'REFUNDED')).resolves.toBe(false);
  });
});

describe('PaymentAttemptRepository', () => {
  const repo = new PaymentAttemptRepository();
  const db: any = {
    paymentAttempt: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  it('create maps fields', async () => {
    await repo.create(db, { id: 'a', paymentIntentId: 'i', gatewayReference: 'g', metadata: { x: 1 } });
    expect(db.paymentAttempt.create).toHaveBeenCalledWith({
      data: { id: 'a', payment_intent_id: 'i', gateway_reference: 'g', metadata: { x: 1 } },
    });
  });

  it('finders', async () => {
    await repo.findByGatewayReference(db, 'g');
    expect(db.paymentAttempt.findFirst).toHaveBeenCalledWith({ where: { gateway_reference: 'g' }, orderBy: { created_at: 'desc' } });
    await repo.findByFawryMerchantRefNum(db, BigInt(5));
    expect(db.paymentAttempt.findUnique).toHaveBeenCalledWith({ where: { fawry_merchant_ref_num: BigInt(5) } });
    await repo.findLatestByPaymentIntentId(db, 'i');
    expect(db.paymentAttempt.findFirst).toHaveBeenLastCalledWith({ where: { payment_intent_id: 'i' }, orderBy: { created_at: 'desc' } });
  });

  it('updateStatus with and without extra fields', async () => {
    await expect(repo.updateStatus(db, 'a', 'FAILED' as any, { failureCode: 'F', metadata: { m: 1 } })).resolves.toBeUndefined();
    expect(db.paymentAttempt.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { status: 'FAILED', failure_code: 'F', metadata: { m: 1 } } });
    await repo.updateStatus(db, 'a', 'SUCCEEDED' as any);
    expect(db.paymentAttempt.update).toHaveBeenLastCalledWith({
      where: { id: 'a' },
      data: { status: 'SUCCEEDED', failure_code: undefined, metadata: undefined },
    });
  });
});

describe('WalletTransactionRepository', () => {
  const repo = new WalletTransactionRepository();

  it('create defaults status to PENDING', async () => {
    const db: any = { walletTransaction: { create: jest.fn().mockResolvedValue({}) } };
    await repo.create(db, { walletId: 'w', type: 'TOP_UP' as any, amount: '1.00' });
    expect(db.walletTransaction.create.mock.calls[0][0].data).toMatchObject({ wallet_id: 'w', status: 'PENDING', type: 'TOP_UP' });
    await repo.create(db, { walletId: 'w', type: 'TOP_UP' as any, amount: '1.00', status: 'COMPLETED' as any });
    expect(db.walletTransaction.create.mock.calls[1][0].data.status).toBe('COMPLETED');
  });

  it('finders', async () => {
    const db: any = { walletTransaction: { findUnique: jest.fn(), findFirst: jest.fn() } };
    await repo.findByIdempotencyKey(db, 'k');
    expect(db.walletTransaction.findUnique).toHaveBeenCalledWith({ where: { idempotency_key: 'k' } });
    await repo.findByPaymentIntentId(db, 'i');
    expect(db.walletTransaction.findFirst).toHaveBeenCalledWith({ where: { payment_intent_id: 'i' } });
  });

  it('markCompleted / markFailed only act on PENDING rows', async () => {
    const db: any = { walletTransaction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await expect(repo.markCompleted(db, 't', '10.00')).resolves.toBe(true);
    expect(db.walletTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: 't', status: 'PENDING' },
      data: { status: 'COMPLETED', resulting_balance: '10.00' },
    });
    db.walletTransaction.updateMany.mockResolvedValue({ count: 0 });
    await expect(repo.markFailed(db, 't', 'why')).resolves.toBe(false);
    expect(db.walletTransaction.updateMany).toHaveBeenLastCalledWith({
      where: { id: 't', status: 'PENDING' },
      data: { status: 'FAILED', failure_reason: 'why' },
    });
  });

  it('list without cursor', async () => {
    const db: any = { walletTransaction: { findMany: jest.fn().mockResolvedValue([]) } };
    await repo.list(db, { walletId: 'w', limit: 5 });
    expect(db.walletTransaction.findMany).toHaveBeenCalledWith({
      where: { wallet_id: 'w' },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 5,
    });
  });

  it('list with cursor builds keyset OR', async () => {
    const db: any = { walletTransaction: { findMany: jest.fn().mockResolvedValue([]) } };
    const createdAt = '2026-01-01T00:00:00.000Z';
    await repo.list(db, { walletId: 'w', limit: 5, cursor: { createdAt, id: 'x' } });
    expect(db.walletTransaction.findMany.mock.calls[0][0].where).toEqual({
      wallet_id: 'w',
      OR: [{ created_at: { lt: new Date(createdAt) } }, { created_at: new Date(createdAt), id: { lt: 'x' } }],
    });
  });
});

describe('ProviderLedgerRepository', () => {
  const repo = new ProviderLedgerRepository();

  it('create maps fields', async () => {
    const db: any = { providerLedgerEntry: { create: jest.fn().mockResolvedValue({}) } };
    await repo.create(db, { providerType: 'DOCTOR' as any, providerId: 'p', entryType: 'EARNING' as any, amount: '1.00', relatedPaymentIntentId: 'i' });
    expect(db.providerLedgerEntry.create).toHaveBeenCalledWith({
      data: { provider_type: 'DOCTOR', provider_id: 'p', entry_type: 'EARNING', amount: '1.00', related_payment_intent_id: 'i' },
    });
  });

  it('findByRelatedPaymentIntentId / findAllByProvider', async () => {
    const db: any = { providerLedgerEntry: { findMany: jest.fn().mockResolvedValue([]) } };
    await repo.findByRelatedPaymentIntentId(db, 'i');
    expect(db.providerLedgerEntry.findMany).toHaveBeenCalledWith({ where: { related_payment_intent_id: 'i' } });
    await repo.findAllByProvider(db, { providerType: 'DOCTOR' as any, providerId: 'p' });
    expect(db.providerLedgerEntry.findMany).toHaveBeenLastCalledWith({ where: { provider_type: 'DOCTOR', provider_id: 'p' } });
  });

  it('list with no filters, no skip, no cursor', async () => {
    const db: any = { providerLedgerEntry: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(3) } };
    await repo.list(db, { limit: 10 });
    expect(db.providerLedgerEntry.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 10,
    });
    await expect(repo.count(db, { limit: 10 })).resolves.toBe(3);
    expect(db.providerLedgerEntry.count).toHaveBeenCalledWith({ where: {} });
  });

  it('list with all filters, cursor and no skip', async () => {
    const db: any = { providerLedgerEntry: { findMany: jest.fn().mockResolvedValue([]) } };
    const createdAt = new Date('2026-01-01');
    await repo.list(db, {
      providerType: 'DOCTOR' as any,
      providerId: 'p',
      entryType: 'PAYOUT' as any,
      cursor: { createdAt, id: 'c' },
      limit: 10,
    });
    expect(db.providerLedgerEntry.findMany.mock.calls[0][0].where).toEqual({
      provider_type: 'DOCTOR',
      provider_id: 'p',
      entry_type: 'PAYOUT',
      OR: [{ created_at: { lt: createdAt } }, { created_at: createdAt, id: { lt: 'c' } }],
    });
  });

  it('list with skip ignores the cursor and passes skip', async () => {
    const db: any = { providerLedgerEntry: { findMany: jest.fn().mockResolvedValue([]) } };
    await repo.list(db, { limit: 10, skip: 20, cursor: { createdAt: new Date(), id: 'c' } });
    const arg = db.providerLedgerEntry.findMany.mock.calls[0][0];
    expect(arg.skip).toBe(20);
    expect(arg.where).toEqual({});
  });
});
