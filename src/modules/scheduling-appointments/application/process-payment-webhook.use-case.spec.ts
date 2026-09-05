import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { ProcessPaymentWebhookUseCase } from './process-payment-webhook.use-case';

function buildTx() {
  return {} as any;
}

describe('ProcessPaymentWebhookUseCase', () => {
  const rawBody = { obj: { id: 999 } };
  const hmac = 'valid-hmac';

  const appointmentPayment = {
    paymentAttemptId: 'attempt-1',
    paymentIntentId: 'intent-1',
    payerUserId: 'patient-1',
    payableType: 'APPOINTMENT' as const,
    payableId: 'appointment-1',
    intentStatus: 'CREATED' as const,
    method: 'CARD' as const,
    amount: '200.00',
    currency: 'EGP',
  };

  const walletTopUpPayment = {
    ...appointmentPayment,
    payableType: 'WALLET_TOPUP' as const,
    payableId: 'wallet-tx-1',
  };

  const activeHold = { id: 'hold-1', slot_id: 'slot-1', version: 1, status: 'ACTIVE', expires_at: new Date(Date.now() + 60_000), rescheduled_from_appointment_id: null };
  const slot = { id: 'slot-1', doctor_clinic_affiliation_id: 'aff-1' };
  const billing = { consultFee: '200.00', currency: 'EGP', doctorId: 'doctor-1' };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const webhookEvents = { tryRecordFirstDelivery: jest.fn().mockResolvedValue(true) };
    const gateway = {
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
      parseWebhookEvent: jest.fn().mockReturnValue({ gatewayReference: 'attempt-1', gatewayTransactionId: '999', success: true }),
    };
    const findPayment = { execute: jest.fn() };
    const captureOnlinePayment = { execute: jest.fn() };
    const markFailed = { execute: jest.fn() };
    const handleLatePayment = { execute: jest.fn() };
    const processWalletTopUp = { execute: jest.fn() };
    const holds = { findByPaymentIntentId: jest.fn(), markConverted: jest.fn() };
    const slots = { findById: jest.fn(), markBooked: jest.fn() };
    const appointments = { create: jest.fn() };
    const affiliationBilling = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };

    const useCase = new ProcessPaymentWebhookUseCase(
      prisma as any,
      webhookEvents as any,
      gateway as any,
      findPayment as any,
      captureOnlinePayment as any,
      markFailed as any,
      handleLatePayment as any,
      processWalletTopUp as any,
      holds as any,
      slots as any,
      appointments as any,
      affiliationBilling as any,
      audit as any,
      outbox as any,
    );

    return {
      tx,
      webhookEvents,
      gateway,
      findPayment,
      captureOnlinePayment,
      markFailed,
      handleLatePayment,
      processWalletTopUp,
      holds,
      slots,
      appointments,
      affiliationBilling,
      audit,
      outbox,
      useCase,
    };
  }

  it('rejects an unverified/invalid signature before touching webhook_events or the database', async () => {
    const { webhookEvents, gateway, useCase } = setup();
    gateway.verifyWebhookSignature.mockReturnValue(false);

    const result = await useCase.execute({ provider: 'paymob', rawBody, hmac: 'bad' });

    expect(result).toEqual({ handled: false });
    expect(webhookEvents.tryRecordFirstDelivery).not.toHaveBeenCalled();
  });

  it('is a safe no-op for a duplicate delivery of an already-recorded webhook event', async () => {
    const { webhookEvents, findPayment, useCase } = setup();
    webhookEvents.tryRecordFirstDelivery.mockResolvedValue(false);

    const result = await useCase.execute({ provider: 'paymob', rawBody, hmac });

    expect(result).toEqual({ handled: true });
    expect(findPayment.execute).not.toHaveBeenCalled();
  });

  it('reports unhandled for a gateway reference matching no known attempt', async () => {
    const { findPayment, useCase } = setup();
    findPayment.execute.mockResolvedValue(null);

    const result = await useCase.execute({ provider: 'paymob', rawBody, hmac });

    expect(result).toEqual({ handled: false });
  });

  describe('WALLET_TOPUP payable', () => {
    it('credits the wallet on a successful webhook (scenario: wallet top-up success)', async () => {
      const { tx, findPayment, processWalletTopUp, useCase } = setup();
      findPayment.execute.mockResolvedValue(walletTopUpPayment);

      const result = await useCase.execute({ provider: 'paymob', rawBody, hmac });

      expect(processWalletTopUp.execute).toHaveBeenCalledWith(tx, { paymentIntentId: 'intent-1' });
      expect(result).toEqual({ handled: true });
    });

    it('marks the attempt failed on a failure webhook (scenario: wallet top-up failure)', async () => {
      const { tx, findPayment, gateway, markFailed, processWalletTopUp, useCase } = setup();
      findPayment.execute.mockResolvedValue(walletTopUpPayment);
      gateway.parseWebhookEvent.mockReturnValue({ gatewayReference: 'attempt-1', gatewayTransactionId: '999', success: false, failureCode: 'INSUFFICIENT_FUNDS' });

      await useCase.execute({ provider: 'paymob', rawBody, hmac });

      expect(markFailed.execute).toHaveBeenCalledWith(tx, { paymentAttemptId: 'attempt-1', paymentIntentId: 'intent-1', failureCode: 'INSUFFICIENT_FUNDS' });
      expect(processWalletTopUp.execute).not.toHaveBeenCalled();
    });
  });

  describe('APPOINTMENT payable', () => {
    it('marks the attempt failed on a failure webhook (scenario: failed card payment)', async () => {
      const { tx, findPayment, gateway, markFailed, useCase } = setup();
      findPayment.execute.mockResolvedValue(appointmentPayment);
      gateway.parseWebhookEvent.mockReturnValue({ gatewayReference: 'attempt-1', gatewayTransactionId: '999', success: false, failureCode: 'DO_NOT_HONOR' });

      const result = await useCase.execute({ provider: 'paymob', rawBody, hmac });

      expect(markFailed.execute).toHaveBeenCalledWith(tx, { paymentAttemptId: 'attempt-1', paymentIntentId: 'intent-1', failureCode: 'DO_NOT_HONOR' });
      expect(result).toEqual({ handled: true });
    });

    it('is a no-op when the intent was already resolved by an earlier delivery (scenario: duplicate Fawry/wallet webhook)', async () => {
      const { holds, findPayment, useCase } = setup();
      findPayment.execute.mockResolvedValue({ ...appointmentPayment, intentStatus: 'CAPTURED' });

      const result = await useCase.execute({ provider: 'paymob', rawBody, hmac });

      expect(result).toEqual({ handled: true });
      expect(holds.findByPaymentIntentId).not.toHaveBeenCalled();
    });

    it('converts the hold, books the slot, captures the payment, and creates the CONFIRMED appointment (scenario: successful Fawry/mobile-wallet/card webhook)', async () => {
      const { tx, findPayment, holds, slots, appointments, affiliationBilling, captureOnlinePayment, audit, outbox, useCase } = setup();
      findPayment.execute.mockResolvedValue(appointmentPayment);
      holds.findByPaymentIntentId.mockResolvedValue(activeHold);
      holds.markConverted.mockResolvedValue(undefined);
      slots.findById.mockResolvedValue(slot);
      slots.markBooked.mockResolvedValue(true);
      affiliationBilling.execute.mockResolvedValue(billing);
      appointments.create.mockResolvedValue({ id: 'appointment-1' });

      const result = await useCase.execute({ provider: 'paymob', rawBody, hmac });

      expect(holds.markConverted).toHaveBeenCalledWith(tx, 'hold-1', 1, expect.any(Date));
      expect(slots.markBooked).toHaveBeenCalledWith(tx, 'slot-1');
      expect(captureOnlinePayment.execute).toHaveBeenCalledWith(tx, { paymentIntentId: 'intent-1', providerType: 'DOCTOR', providerId: 'doctor-1' });
      expect(appointments.create).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'appointment-1', slotId: 'slot-1', patientId: 'patient-1' }));
      expect(audit.record).toHaveBeenCalled();
      expect(outbox.emit).toHaveBeenCalledWith(tx, 'AppointmentConfirmed', expect.objectContaining({ appointmentId: 'appointment-1' }));
      expect(result).toEqual({ handled: true });
    });

    it('does NOT confirm and instead auto-refunds when the hold already expired before the webhook arrived (scenario: webhook after expiration)', async () => {
      const { tx, findPayment, holds, handleLatePayment, appointments, useCase } = setup();
      findPayment.execute.mockResolvedValue(appointmentPayment);
      holds.findByPaymentIntentId.mockResolvedValue({ ...activeHold, status: 'EXPIRED' });

      const result = await useCase.execute({ provider: 'paymob', rawBody, hmac });

      expect(handleLatePayment.execute).toHaveBeenCalledWith(tx, { paymentIntentId: 'intent-1', gatewayReference: 'attempt-1' });
      expect(appointments.create).not.toHaveBeenCalled();
      expect(result).toEqual({ handled: true });
    });

    it('does NOT confirm and instead auto-refunds when the hold is found but its expires_at already passed', async () => {
      const { findPayment, holds, handleLatePayment, useCase } = setup();
      findPayment.execute.mockResolvedValue(appointmentPayment);
      holds.findByPaymentIntentId.mockResolvedValue({ ...activeHold, expires_at: new Date(Date.now() - 1000) });

      await useCase.execute({ provider: 'paymob', rawBody, hmac });

      expect(handleLatePayment.execute).toHaveBeenCalled();
    });

    it('falls back to the late-payment path when markConverted loses the race to a concurrent expiry sweep (scenario: payment success racing with expiration)', async () => {
      const { findPayment, holds, handleLatePayment, appointments, useCase } = setup();
      findPayment.execute.mockResolvedValue(appointmentPayment);
      holds.findByPaymentIntentId.mockResolvedValue(activeHold);
      holds.markConverted.mockRejectedValue(new OptimisticLockError('hold-1', 1));

      const result = await useCase.execute({ provider: 'paymob', rawBody, hmac });

      expect(handleLatePayment.execute).toHaveBeenCalled();
      expect(appointments.create).not.toHaveBeenCalled();
      expect(result).toEqual({ handled: true });
    });
  });
});
