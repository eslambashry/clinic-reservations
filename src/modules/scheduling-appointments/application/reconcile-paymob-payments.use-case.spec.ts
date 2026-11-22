import { ReconcilePaymobPaymentsUseCase } from './reconcile-paymob-payments.use-case';

describe('ReconcilePaymobPaymentsUseCase', () => {
  const item = (over: any = {}) => ({
    paymentIntentId: 'pi1',
    payableType: 'WALLET_TOPUP',
    createdAt: new Date(),
    attempt: { id: 'att1', status: 'INITIATED', gatewayReference: 'att1' },
    ...over,
  });
  const event = { gatewayReference: 'att1', gatewayTransactionId: 't1', success: true, amountCents: 1000, currency: 'EGP' };

  function setup(items: any[], inquiry: any) {
    const findStale = { execute: jest.fn().mockResolvedValue(items) };
    const gateway = { queryTransaction: jest.fn().mockImplementation(() => (inquiry instanceof Error ? Promise.reject(inquiry) : Promise.resolve(inquiry))) };
    const processWebhook = { processVerifiedEvent: jest.fn().mockResolvedValue({ handled: true }) };
    const uc = new ReconcilePaymobPaymentsUseCase(findStale as any, gateway as any, processWebhook as any);
    return { findStale, gateway, processWebhook, uc };
  }

  it('queries stale CARD intents and routes PAID through the webhook path', async () => {
    const { uc, findStale, gateway, processWebhook } = setup([item()], { status: 'PAID', event, rawBody: { id: 't1' } });
    const result = await uc.execute();
    expect(findStale.execute).toHaveBeenCalledWith(expect.objectContaining({ payableTypes: ['WALLET_TOPUP', 'APPOINTMENT'], requireInitiatedAttempt: true }));
    expect(gateway.queryTransaction).toHaveBeenCalledWith('att1');
    expect(processWebhook.processVerifiedEvent).toHaveBeenCalledWith('paymob', { id: 't1' }, event);
    expect(result).toEqual({ checked: 1, paid: 1, failed: 0 });
  });

  it('routes FAILED through the webhook path as a failure', async () => {
    const failed = { ...event, success: false, failureCode: '5' };
    const { uc, processWebhook } = setup([item()], { status: 'FAILED', event: failed });
    expect(await uc.execute()).toEqual({ checked: 1, paid: 0, failed: 1 });
    expect(processWebhook.processVerifiedEvent).toHaveBeenCalledWith('paymob', {}, failed);
  });

  it.each(['PENDING', 'NOT_FOUND'])('does nothing for %s', async (status) => {
    const { uc, processWebhook } = setup([item()], { status });
    await uc.execute();
    expect(processWebhook.processVerifiedEvent).not.toHaveBeenCalled();
  });

  it('skips intents without an INITIATED attempt without calling the gateway', async () => {
    const { uc, gateway } = setup([], null);
    expect(await uc.reconcileOne(item({ attempt: { id: 'a', status: 'FAILED', gatewayReference: 'a' } }))).toBe('SKIPPED');
    expect(await uc.reconcileOne(item({ attempt: null }))).toBe('SKIPPED');
    expect(gateway.queryTransaction).not.toHaveBeenCalled();
  });

  it('swallows gateway errors per item and keeps going', async () => {
    const { uc, processWebhook } = setup([item(), item({ paymentIntentId: 'pi2' })], new Error('boom'));
    jest.spyOn((uc as any).logger, 'warn').mockImplementation();
    expect(await uc.execute()).toEqual({ checked: 2, paid: 0, failed: 0 });
    expect(processWebhook.processVerifiedEvent).not.toHaveBeenCalled();
  });
});
