import { CancelOnlinePaymentIntentUseCase } from './cancel-online-payment-intent.use-case';

function buildTx() {
  return {} as any;
}

describe('CancelOnlinePaymentIntentUseCase', () => {
  function setup() {
    const paymentIntents = { findById: jest.fn(), markCancelled: jest.fn() };
    const paymentAttempts = { findLatestByPaymentIntentId: jest.fn() };
    const fawryGateway = { cancelUnpaidOrder: jest.fn() };
    const useCase = new CancelOnlinePaymentIntentUseCase(paymentIntents as any, paymentAttempts as any, fawryGateway as any);
    return { paymentIntents, paymentAttempts, fawryGateway, useCase };
  }

  describe('execute (DB-only, tx-scoped)', () => {
    it('is a no-op when the intent no longer exists', async () => {
      const { paymentIntents, useCase } = setup();
      paymentIntents.findById.mockResolvedValue(null);

      const result = await useCase.execute(buildTx(), 'intent-1');

      expect(result).toBeNull();
      expect(paymentIntents.markCancelled).not.toHaveBeenCalled();
    });

    it('marks a CARD intent cancelled and returns no Fawry reference (nothing more to do upstream)', async () => {
      const { paymentIntents, useCase } = setup();
      const tx = buildTx();
      paymentIntents.findById.mockResolvedValue({ id: 'intent-1', version: 1, method: 'CARD' });

      const result = await useCase.execute(tx, 'intent-1');

      expect(paymentIntents.markCancelled).toHaveBeenCalledWith(tx, 'intent-1', 1);
      expect(result).toEqual({ method: 'CARD', fawryReferenceNumber: null });
    });

    it('marks a FAWRY intent cancelled and resolves its stored referenceCode for the upstream cancel call', async () => {
      const { paymentIntents, paymentAttempts, useCase } = setup();
      const tx = buildTx();
      paymentIntents.findById.mockResolvedValue({ id: 'intent-1', version: 1, method: 'FAWRY' });
      paymentAttempts.findLatestByPaymentIntentId.mockResolvedValue({ metadata: { referenceCode: '963455678' } });

      const result = await useCase.execute(tx, 'intent-1');

      expect(result).toEqual({ method: 'FAWRY', fawryReferenceNumber: '963455678' });
    });

    it('resolves a null referenceCode for a FAWRY intent with no attempt/metadata on record', async () => {
      const { paymentIntents, paymentAttempts, useCase } = setup();
      paymentIntents.findById.mockResolvedValue({ id: 'intent-1', version: 1, method: 'FAWRY' });
      paymentAttempts.findLatestByPaymentIntentId.mockResolvedValue(null);

      const result = await useCase.execute(buildTx(), 'intent-1');

      expect(result).toEqual({ method: 'FAWRY', fawryReferenceNumber: null });
    });
  });

  describe('notifyGatewayIfNeeded (post-commit, live network call)', () => {
    it('calls cancelUnpaidOrder for a FAWRY intent with a resolved reference number', async () => {
      const { fawryGateway, useCase } = setup();

      await useCase.notifyGatewayIfNeeded({ method: 'FAWRY', fawryReferenceNumber: '963455678' });

      expect(fawryGateway.cancelUnpaidOrder).toHaveBeenCalledWith('963455678');
    });

    it('is a no-op for null (no intent was found/cancelled)', async () => {
      const { fawryGateway, useCase } = setup();

      await useCase.notifyGatewayIfNeeded(null);

      expect(fawryGateway.cancelUnpaidOrder).not.toHaveBeenCalled();
    });

    it('is a no-op for a non-FAWRY method', async () => {
      const { fawryGateway, useCase } = setup();

      await useCase.notifyGatewayIfNeeded({ method: 'CARD', fawryReferenceNumber: null });

      expect(fawryGateway.cancelUnpaidOrder).not.toHaveBeenCalled();
    });

    it('is a no-op when a FAWRY intent has no resolved reference number', async () => {
      const { fawryGateway, useCase } = setup();

      await useCase.notifyGatewayIfNeeded({ method: 'FAWRY', fawryReferenceNumber: null });

      expect(fawryGateway.cancelUnpaidOrder).not.toHaveBeenCalled();
    });

    it('swallows (logs, does not throw) a failed cancelUnpaidOrder call', async () => {
      const { fawryGateway, useCase } = setup();
      fawryGateway.cancelUnpaidOrder.mockRejectedValue(new Error('Fawry unavailable'));

      await expect(useCase.notifyGatewayIfNeeded({ method: 'FAWRY', fawryReferenceNumber: '963455678' })).resolves.toBeUndefined();
    });
  });
});
