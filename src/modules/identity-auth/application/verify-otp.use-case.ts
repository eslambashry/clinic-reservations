import { Inject, Injectable, Logger } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { DomainError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { verifyOtpCode } from '../domain/otp-code.util';
import { OTP_CONSTANTS } from '../domain/otp.constants';
import { OtpRequestRepository } from '../infrastructure/otp-request.repository';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';
import { TokenService } from '../infrastructure/token.service';
import { UserRepository } from '../infrastructure/user.repository';

export interface VerifyOtpInput {
  requestId: string;
  code: string;
}

export interface VerifyOtpResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  isNewUser: boolean;
}

const PATIENT_ROLE_CODE = 'PATIENT';

@Injectable()
export class VerifyOtpUseCase {
  private readonly logger = new Logger(VerifyOtpUseCase.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OtpRequestRepository) private readonly otpRequests: OtpRequestRepository,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(input: VerifyOtpInput): Promise<VerifyOtpResult> {
    // Deliberately NOT one transaction end-to-end: an incorrect-code attempt
    // must increment+persist `otp_requests.attempts` even though the same
    // call also throws — if that increment lived inside a transaction we
    // then roll back by throwing, the attempt counter would never actually
    // stick and the "5 attempts then lock" rule (File 10 §2.3) would
    // silently not work. So: validation + failed-attempt recording are
    // individually committed writes; only the SUCCESS path (consume + user
    // + membership + tokens + outbox event) is one atomic transaction.
    const otpRequest = await this.otpRequests.findById(this.prisma, input.requestId);

    // Not-found and already-consumed both surface as INVALID_CODE — never
    // reveal whether a requestId exists/was already used.
    if (!otpRequest || otpRequest.consumed_at) {
      throw new DomainError(400, 'INVALID_CODE', 'رمز التحقق غير صحيح. راجع الرمز وأعد المحاولة.');
    }

    if (otpRequest.expires_at.getTime() < Date.now()) {
      throw new DomainError(410, 'CODE_EXPIRED', 'انتهت صلاحية رمز التحقق. اطلب رمزًا جديدًا.');
    }

    if (otpRequest.attempts >= OTP_CONSTANTS.MAX_VERIFY_ATTEMPTS) {
      throw new DomainError(423, 'TOO_MANY_ATTEMPTS', 'تجاوزت عدد المحاولات المسموح بها. اطلب رمزًا جديدًا.');
    }

    const matches = await verifyOtpCode(otpRequest.code_hash, input.code);
    if (!matches) {
      const updated = await this.otpRequests.incrementAttempts(this.prisma, otpRequest.id);
      if (updated.attempts >= OTP_CONSTANTS.MAX_VERIFY_ATTEMPTS) {
        throw new DomainError(423, 'TOO_MANY_ATTEMPTS', 'تجاوزت عدد المحاولات المسموح بها. اطلب رمزًا جديدًا.');
      }
      throw new DomainError(400, 'INVALID_CODE', 'رمز التحقق غير صحيح. راجع الرمز وأعد المحاولة.');
    }

    // Explicit timeout (Prisma's default is 5000ms) — same reasoning as
    // ConfirmAppointmentUseCase/CancelAppointmentUseCase (File 12 Part
    // 36.13): this transaction's several sequential writes (consume OTP,
    // find/create user, find/create role membership, issue tokens, emit
    // outbox) were observed exceeding the default under this environment's
    // real Postgres round-trip latency.
    return this.prisma.$transaction(async (tx) => {
      await this.otpRequests.markConsumed(tx, otpRequest.id);

      let user = await this.users.findByPhone(tx, otpRequest.phone);
      const isNewUser = !user;
      if (!user) {
        user = await this.users.create(tx, otpRequest.phone);
      }

      let memberships = await this.roleMemberships.findActiveByUser(tx, user.id);
      if (memberships.length === 0) {
        const membership = await this.roleMemberships.create(tx, {
          userId: user.id,
          roleCode: PATIENT_ROLE_CODE,
          contextType: RoleContextType.PATIENT,
        });
        memberships = [membership];
      }

      // Phase 1 scope: a self-registered user has exactly one (PATIENT)
      // membership — provider-side role_memberships are Admin-provisioned
      // in a later phase, not through this endpoint. *Which* membership
      // becomes the token's active context once a user can have more than
      // one is genuinely unresolved by File 11 (07.1 says the JWT carries
      // "active" context, but no endpoint selects it) — deferred to when
      // Phase 2 actually introduces a second membership per user, not
      // guessed at here.
      const activeMembership = memberships[0];

      const issued = await this.tokens.issue(tx, activeMembership);

      await this.outbox.emit(tx, isNewUser ? 'UserRegistered' : 'UserLoggedIn', {
        userId: user.id,
        phone: user.phone,
      });

      this.logger.log(`${isNewUser ? 'Registered' : 'Logged in'} user ${user.id}`);

      return {
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        expiresIn: issued.expiresIn,
        userId: user.id,
        isNewUser,
      };
    }, { timeout: 15000 });
  }
}
