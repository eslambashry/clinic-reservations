export const OTP_SENDER = Symbol('OTP_SENDER');

/** `otp_requests.purpose` values — the sender picks the message wording from it. */
export type OtpPurpose = 'LOGIN_OR_SIGNUP' | 'PASSWORD_RESET';

/**
 * File 12 Part 54 / `DEC-003`: bound to `SmsMisrOtpSender` when
 * `SMS_PROVIDER=smsmisr`, otherwise to the dev-only `LoggingOtpSender`
 * (`identity-auth.module.ts`). `RequestOtpUseCase` never knows which.
 */
export interface OtpSenderPort {
  send(phone: string, code: string, purpose: OtpPurpose): Promise<void>;
}
