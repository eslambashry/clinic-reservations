import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { validateOtpCode } from '../domain/otp-verification.util';
import { OtpRequestRepository } from '../infrastructure/otp-request.repository';

export interface VerifyResetCodeInput {
  requestId: string;
  code: string;
}

export interface VerifyResetCodeResult {
  valid: true;
}

const PASSWORD_RESET_PURPOSE = 'PASSWORD_RESET';

/**
 * Lets a client check a PASSWORD_RESET OTP code before showing the
 * "set a new password" step — same validation rule set as
 * `ResetPasswordUseCase` (via the shared `validateOtpCode` helper), but
 * deliberately read-only: it never marks the OTP consumed and never touches
 * `password_hash`. A wrong-code attempt here still increments
 * `otp_requests.attempts` (shared with `ResetPasswordUseCase`'s counter, by
 * design — it's the same code, so failed guesses here still count toward
 * the same "5 attempts then lock" rule), but the code stays usable for the
 * real `POST /v1/auth/password/reset` call once verified.
 */
@Injectable()
export class VerifyResetCodeUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OtpRequestRepository) private readonly otpRequests: OtpRequestRepository,
  ) {}

  async execute(input: VerifyResetCodeInput): Promise<VerifyResetCodeResult> {
    const otpRequest = await this.otpRequests.findById(this.prisma, input.requestId);
    await validateOtpCode(otpRequest, { code: input.code, purpose: PASSWORD_RESET_PURPOSE }, (id) =>
      this.otpRequests.incrementAttempts(this.prisma, id),
    );

    return { valid: true };
  }
}
