import { Inject, Injectable, Logger } from '@nestjs/common';
import * as argon2 from '@node-rs/argon2';
import { DomainError, UnauthenticatedError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PASSWORD_CONSTANTS } from '../domain/password.constants';
import { PhoneRateLimiterService } from '../infrastructure/phone-rate-limiter.service';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';
import { TokenService } from '../infrastructure/token.service';
import { UserRepository } from '../infrastructure/user.repository';

export interface LoginWithPasswordInput {
  phone: string;
  password: string;
}

export interface LoginWithPasswordResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
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
      throw new DomainError(429, 'RATE_LIMITED', 'Too many login attempts for this phone number — try again later.');
    }

    const user = await this.users.findByPhone(this.prisma, input.phone);

    // No password set yet is not a crash — same "invalid credentials", never
    // reveal whether the phone/password_hash exists.
    if (!user || !user.password_hash) {
      throw new UnauthenticatedError('UNAUTHENTICATED', 'Invalid phone number or password.');
    }

    const matches = await argon2.verify(user.password_hash, input.password);
    if (!matches) {
      throw new UnauthenticatedError('UNAUTHENTICATED', 'Invalid phone number or password.');
    }

    // A SUSPENDED account (e.g. a doctor suspending a clinic assistant via
    // `PATCH /v1/provider/assistants/:id`) must never authenticate, even
    // with a correct password — checked after credential verification so a
    // guess against a suspended phone still reveals nothing extra.
    if (user.status === 'SUSPENDED') {
      throw new UnauthenticatedError('UNAUTHENTICATED', 'Invalid phone number or password.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Phase 1 scope: exactly one (PATIENT) membership per user — see the
      // same note in `verify-otp.use-case.ts`.
      const memberships = await this.roleMemberships.findActiveByUser(tx, user.id);
      const activeMembership = memberships[0];
      if (!activeMembership) {
        throw new UnauthenticatedError('UNAUTHENTICATED', 'No active role membership for this account.');
      }

      const issued = await this.tokens.issue(tx, activeMembership);

      this.logger.log(`Logged in user ${user.id} via password`);

      return {
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        expiresIn: issued.expiresIn,
        userId: user.id,
      };
    });
  }
}
