import { Inject, Injectable, Logger } from '@nestjs/common';
import * as argon2 from '@node-rs/argon2';
import { DomainError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { validateOtpCode } from '../domain/otp-verification.util';
import { OtpRequestRepository } from '../infrastructure/otp-request.repository';
import { RefreshTokenRepository } from '../infrastructure/refresh-token.repository';
import { UserRepository } from '../infrastructure/user.repository';

export interface ResetPasswordInput {
  requestId: string;
  code: string;
  newPassword: string;
}

export type ResetPasswordResult = void;

const PASSWORD_RESET_PURPOSE = 'PASSWORD_RESET';

@Injectable()
export class ResetPasswordUseCase {
  private readonly logger = new Logger(ResetPasswordUseCase.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OtpRequestRepository) private readonly otpRequests: OtpRequestRepository,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(RefreshTokenRepository) private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(input: ResetPasswordInput): Promise<ResetPasswordResult> {
    // Same "validation + failed-attempt recording are individually committed
    // writes; only the success path is one atomic transaction" shape as
    // `VerifyOtpUseCase` — an incorrect-code attempt must persist its
    // `attempts` increment even though this call then throws. The actual
    // rule set (not-found/consumed/wrong-purpose/expired/max-attempts/wrong
    // code) lives in `validateOtpCode`, shared with `VerifyResetCodeUseCase`.
    const otpRequestOrNull = await this.otpRequests.findById(this.prisma, input.requestId);
    await validateOtpCode(otpRequestOrNull, { code: input.code, purpose: PASSWORD_RESET_PURPOSE }, (id) =>
      this.otpRequests.incrementAttempts(this.prisma, id),
    );
    // `validateOtpCode` throws for a null/invalid record, so it's guaranteed
    // non-null past this point — narrow once here rather than re-checking.
    const otpRequest = otpRequestOrNull!;

    return this.prisma.$transaction(async (tx) => {
      await this.otpRequests.markConsumed(tx, otpRequest.id);

      // Not-found here would mean the phone tied to this OTP request has no
      // user yet — never happens for PASSWORD_RESET (an account must
      // already exist to have requested a reset), but surfaced the same way
      // as any other invalid-code case rather than a 500.
      const user = await this.users.findByPhone(tx, otpRequest.phone);
      if (!user) {
        throw new DomainError(400, 'INVALID_CODE', 'The provided code is invalid.');
      }

      const passwordHash = await argon2.hash(input.newPassword);
      await this.users.setPassword(tx, user.id, passwordHash);

      // Theft-detection-style full revoke (`RefreshTokenUseCase`'s reuse
      // path) — a password reset must invalidate every existing session,
      // not just the current device.
      await this.refreshTokens.revokeAllActiveForUser(tx, user.id);

      this.logger.log(`Password reset for user ${user.id} — all active refresh tokens revoked.`);
    });
  }
}
