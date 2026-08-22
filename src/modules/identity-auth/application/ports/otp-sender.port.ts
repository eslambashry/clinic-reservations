export const OTP_SENDER = Symbol('OTP_SENDER');

/**
 * SMS provider is `OPEN DECISION` (File 11 Part 01/DEC in File 10 Part 4) —
 * nothing is wired. This port lets `RequestOtpUseCase` stay correct and
 * testable now; swap the DI binding for a real SMS adapter (`infrastructure/`)
 * the moment that decision resolves, with zero use-case changes.
 */
export interface OtpSenderPort {
  send(phone: string, code: string): Promise<void>;
}
