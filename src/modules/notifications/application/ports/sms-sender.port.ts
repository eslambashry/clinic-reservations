export const SMS_SENDER = Symbol('SMS_SENDER');

/** File 10 Part 4 `DEC-003` (SMS provider) is still `Open` — same situation `identity-auth`'s `OtpSenderPort` is already in. Mirrors it exactly. */
export interface SmsSenderPort {
  send(phone: string, message: string): Promise<void>;
}
