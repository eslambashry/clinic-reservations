export const SMS_SENDER = Symbol('SMS_SENDER');

/** File 10 Part 4 `DEC-003` (SMS provider) is still `Open` — same situation `identity-auth`'s `OtpSenderPort` is already in. Mirrors it exactly. */
export interface SmsSenderPort {
  send(phone: string, message: string): Promise<void>;
}

/**
 * The SMS channel cannot deliver at all (no provider configured). Distinct
 * from a transient send failure: retrying cannot succeed, so the delivery
 * row is closed as FAILED immediately instead of burning every retry.
 */
export class SmsChannelUnavailableError extends Error {
  constructor() {
    super('SMS_PROVIDER_NOT_CONFIGURED');
    this.name = 'SmsChannelUnavailableError';
  }
}
