import { Inject, Injectable } from '@nestjs/common';
import { RequestOtpResult, RequestOtpUseCase } from './request-otp.use-case';

export interface ForgotPasswordInput {
  phone: string;
  /** For the File 10 §2.3 security log (request attempt: phone, ip, timestamp) — not stored in `otp_requests`. */
  ip?: string;
}

export type ForgotPasswordResult = RequestOtpResult;

const PASSWORD_RESET_PURPOSE = 'PASSWORD_RESET';

/**
 * Deliberately not its own OTP-creation logic — reuses `RequestOtpUseCase`
 * (rate-limiting, code generation/hashing, sender, security log) as-is,
 * only supplying a different `purpose` so `otp_requests` rows created here
 * are distinguishable from unified login/signup OTPs.
 */
@Injectable()
export class ForgotPasswordUseCase {
  constructor(@Inject(RequestOtpUseCase) private readonly requestOtp: RequestOtpUseCase) {}

  execute(input: ForgotPasswordInput): Promise<ForgotPasswordResult> {
    return this.requestOtp.execute({ phone: input.phone, ip: input.ip, purpose: PASSWORD_RESET_PURPOSE });
  }
}
