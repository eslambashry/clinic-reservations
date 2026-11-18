import { PaymentsWebhookController } from './payments-webhook.controller';

describe('PaymentsWebhookController', () => {
  it('processes the webhook and always acknowledges', async () => {
    const uc = { execute: jest.fn().mockResolvedValue(undefined) };
    const controller = new PaymentsWebhookController(uc as any);
    const body = { a: 1 };
    await expect(controller.handle('paymob', body, 'sig')).resolves.toEqual({ received: true });
    expect(uc.execute).toHaveBeenCalledWith({ provider: 'paymob', rawBody: body, hmac: 'sig' });
  });

  it('propagates use-case errors', async () => {
    const uc = { execute: jest.fn().mockRejectedValue(new Error('boom')) };
    const controller = new PaymentsWebhookController(uc as any);
    await expect(controller.handle('fawry', {}, undefined)).rejects.toThrow('boom');
  });
});
