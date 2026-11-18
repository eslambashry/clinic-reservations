import { DomainError } from '../../../shared/core/errors/domain-errors';
import { InitiateWalletTopUpUseCase } from './initiate-wallet-top-up.use-case';

describe('InitiateWalletTopUpUseCase', () => {
  const customer = { firstName: 'a', lastName: 'b', email: 'e@x.com', phone: '+2010' } as any;
  const tx = { tx: true } as any;
  const prepared = { paymentIntentId: 'pi-1', paymentAttemptId: 'pa-1' };

  function setup() {
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const wallets = { getOrCreate: jest.fn().mockResolvedValue({ id: 'w1', currency: 'EGP' }) };
    const walletTransactions = { create: jest.fn().mockResolvedValue({}) };
    const online = {
      prepare: jest.fn().mockResolvedValue(prepared),
      callGateway: jest.fn().mockResolvedValue({ redirectUrl: 'https://pay', metadata: { m: 1 } }),
      completeFailure: jest.fn().mockResolvedValue(undefined),
      completeSuccess: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new InitiateWalletTopUpUseCase(prisma as any, wallets as any, walletTransactions as any, online as any);
    return { prisma, wallets, walletTransactions, online, useCase };
  }

  it.each(['0', '-5', 'abc', ''])('rejects invalid amount %p', async (amount) => {
    const { useCase, prisma } = setup();
    await expect(useCase.execute({ userId: 'u1', amount, customer })).rejects.toMatchObject({ code: 'INVALID_AMOUNT', httpStatus: 400 });
    await expect(useCase.execute({ userId: 'u1', amount, customer })).rejects.toBeInstanceOf(DomainError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('prepares, records a pending TOP_UP, calls the gateway and completes success', async () => {
    const { useCase, wallets, walletTransactions, online, prisma } = setup();
    const result = await useCase.execute({ userId: 'u1', amount: '100.00', customer });

    expect(wallets.getOrCreate).toHaveBeenCalledWith(tx, 'u1', 'EGP');
    const prepArg = online.prepare.mock.calls[0][1];
    expect(prepArg).toMatchObject({
      payerUserId: 'u1',
      payableType: 'WALLET_TOPUP',
      amount: '100.00',
      currency: 'EGP',
      method: 'CARD',
      customer,
    });
    expect(prepArg.expiresAt).toBeInstanceOf(Date);
    expect(prepArg.idempotencyKey).toBe(`topup:${prepArg.payableId}`);
    expect(walletTransactions.create).toHaveBeenCalledWith(tx, {
      id: prepArg.payableId,
      walletId: 'w1',
      type: 'TOP_UP',
      status: 'PENDING',
      amount: '100.00',
      paymentIntentId: 'pi-1',
      idempotencyKey: `topup:${prepArg.payableId}`,
    });
    expect(online.callGateway).toHaveBeenCalledWith(prepared);
    expect(online.completeSuccess).toHaveBeenCalledWith(tx, 'pa-1', { m: 1 });
    expect(online.completeFailure).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ walletTransactionId: prepArg.payableId, paymentIntentId: 'pi-1', redirectUrl: 'https://pay' });
  });

  it('marks the attempt failed and rethrows when the gateway call fails', async () => {
    const { useCase, online } = setup();
    const err = new Error('gateway down');
    online.callGateway.mockRejectedValue(err);
    await expect(useCase.execute({ userId: 'u1', amount: '10', customer })).rejects.toBe(err);
    expect(online.completeFailure).toHaveBeenCalledWith(tx, 'pa-1');
    expect(online.completeSuccess).not.toHaveBeenCalled();
  });
});
