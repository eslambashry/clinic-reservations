import { holdExpiresAt, onlinePaymentHoldExpiresAt } from './appointment-lifecycle.rules';

describe('holdExpiresAt', () => {
  it('is 5 minutes after creation (the base hold TTL)', () => {
    const createdAt = new Date('2026-01-15T09:00:00.000Z');
    expect(holdExpiresAt(createdAt)).toEqual(new Date('2026-01-15T09:05:00.000Z'));
  });
});

describe('onlinePaymentHoldExpiresAt', () => {
  const from = new Date('2026-01-15T09:00:00.000Z');

  it('extends to 15 minutes for FAWRY', () => {
    expect(onlinePaymentHoldExpiresAt(from, 'FAWRY')).toEqual(new Date('2026-01-15T09:15:00.000Z'));
  });

  it('extends to 10 minutes for MOBILE_WALLET', () => {
    expect(onlinePaymentHoldExpiresAt(from, 'MOBILE_WALLET')).toEqual(new Date('2026-01-15T09:10:00.000Z'));
  });

  it('keeps the existing 5-minute window for CARD (unchanged business requirement)', () => {
    expect(onlinePaymentHoldExpiresAt(from, 'CARD')).toEqual(new Date('2026-01-15T09:05:00.000Z'));
  });
});
