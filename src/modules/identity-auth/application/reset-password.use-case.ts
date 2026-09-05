import { Inject, Injectable, Logger } from '@nestjs/common';
import * as argon2 from '@node-rs/argon2';
import { DomainError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { OtpRequestRepository } from '../infrastructure/otp-request.repository';
import { RefreshTokenRepository } from '../infrastructure/refresh-token.repository';
import { UserRepository } from '../infrastructure/user.repository';

export interface ResetPasswordInput {
  requestId: string;
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
    const otpRequestOrNull = await this.otpRequests.findById(this.prisma, input.requestId);
    if (!otpRequestOrNull || otpRequestOrNull.consumed_at || otpRequestOrNull.purpose !== PASSWORD_RESET_PURPOSE) {
      throw new DomainError(400, 'INVALID_CODE', 'رمز التحقق غير صحيح. راجع الرمز وأعد المحاولة.');
    }
    if (otpRequestOrNull.expires_at.getTime() < Date.now()) {
      throw new DomainError(410, 'CODE_EXPIRED', 'انتهت صلاحية رمز التحقق. اطلب رمزًا جديدًا.');
    }
    if (!otpRequestOrNull.verified_at) {
      throw new DomainError(400, 'INVALID_CODE', 'يجب التحقق من رمز OTP قبل تعيين كلمة المرور.');
    }
    const otpRequest = otpRequestOrNull;

    return this.prisma.$transaction(async (tx) => {
      await this.otpRequests.markConsumed(tx, otpRequest.id);

      // Not-found here would mean the phone tied to this OTP request has no
      // user yet — never happens for PASSWORD_RESET (an account must
      // already exist to have requested a reset), but surfaced the same way
      // as any other invalid-code case rather than a 500.
      const user = await this.users.findByPhone(tx, otpRequest.phone);
      if (!user) {
        throw new DomainError(400, 'INVALID_CODE', 'رمز التحقق غير صحيح. راجع الرمز وأعد المحاولة.');
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
