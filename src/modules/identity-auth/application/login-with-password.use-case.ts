import { Inject, Injectable, Logger } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import * as argon2 from '@node-rs/argon2';
import { DomainError, ForbiddenError, UnauthenticatedError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PASSWORD_CONSTANTS } from '../domain/password.constants';
import { PhoneRateLimiterService } from '../infrastructure/phone-rate-limiter.service';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';
import { TokenService } from '../infrastructure/token.service';
import { UserRepository } from '../infrastructure/user.repository';

export interface LoginWithPasswordInput {
  phone: string;
  password: string;
  role?: RoleContextType;
}

export interface LoginWithPasswordResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  role: string;
}

@Injectable()
export class LoginWithPasswordUseCase {
  private readonly logger = new Logger(LoginWithPasswordUseCase.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(PhoneRateLimiterService) private readonly rateLimiter: PhoneRateLimiterService,
  ) {}

  async execute(input: LoginWithPasswordInput): Promise<LoginWithPasswordResult> {
    // Distinct key/window from OTP-request rate limiting (`otp-rate:`) —
    // a password-guessing attack and an OTP-spam attack are different
    // threats and shouldn't share (or exhaust) the same counter.
    const allowed = await this.rateLimiter.consume(input.phone, {
      keyPrefix: 'password-login-rate',
      maxRequests: PASSWORD_CONSTANTS.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
      windowSeconds: PASSWORD_CONSTANTS.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    });
    if (!allowed) {
      throw new DomainError(429, 'RATE_LIMITED', 'محاولات تسجيل دخول كثيرة على هذا الرقم. انتظر قليلاً ثم أعد المحاولة.');
    }

    const user = await this.users.findByPhone(this.prisma, input.phone);

    // No password set yet is not a crash — same "invalid credentials", never
    // reveal whether the phone/password_hash exists.
    if (!user || !user.password_hash) {
      throw new UnauthenticatedError('UNAUTHENTICATED', 'رقم الهاتف أو كلمة المرور غير صحيحة.');
    }

    const matches = await argon2.verify(user.password_hash, input.password);
    if (!matches) {
      throw new UnauthenticatedError('UNAUTHENTICATED', 'رقم الهاتف أو كلمة المرور غير صحيحة.');
    }

    // A SUSPENDED account (e.g. a doctor suspending a clinic assistant via
    // `PATCH /v1/provider/assistants/:id`) must never authenticate, even
    // with a correct password — checked after credential verification so a
    // guess against a suspended phone still reveals nothing extra.
    if (user.status === 'SUSPENDED') {
      throw new UnauthenticatedError('UNAUTHENTICATED', 'رقم الهاتف أو كلمة المرور غير صحيحة.');
    }

    return this.prisma.$transaction(async (tx) => {
      const memberships = input.role
        ? await this.roleMemberships.findActiveByUserRoleContextType(tx, {
            userId: user.id,
            roleCode: input.role,
            contextType: input.role,
          })
        : await this.roleMemberships.findActiveByUser(tx, user.id);
      const activeMembership = memberships[0];
      if (!activeMembership) {
        if (input.role) {
          throw new ForbiddenError('ROLE_NOT_PERMITTED', `لا يوجد دور «${input.role}» نشِط لهذا الحساب.`);
        }
        throw new UnauthenticatedError('UNAUTHENTICATED', 'لا يوجد دور نشِط لهذا الحساب. تواصل مع الدعم.');
      }

      const issued = await this.tokens.issue(tx, activeMembership);

      this.logger.log({ userId: user.id, role: activeMembership.role_code }, 'Password login succeeded');

      return {
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        expiresIn: issued.expiresIn,
        userId: user.id,
        role: activeMembership.role_code,
      };
    });
  }
}
