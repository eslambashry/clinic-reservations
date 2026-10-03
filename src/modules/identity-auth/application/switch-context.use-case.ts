import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { DomainError, UnauthenticatedError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';
import { RefreshTokenRepository } from '../infrastructure/refresh-token.repository';
import { TokenService } from '../infrastructure/token.service';

export interface SwitchContextInput {
  contextType: RoleContextType;
}

export interface SwitchContextResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * S-2 fix: an explicit, caller-initiated way to move the active JWT
 * context to a *different* ACTIVE membership the same user already holds
 * — e.g. a verified doctor switching back to PATIENT to book their own
 * appointment, without that identity having been silently unreachable
 * since the day they were verified (`RoleMembershipRepository
 * .findActiveByUser`'s most-recent-first ordering otherwise always wins).
 *
 * Deliberately issues an independent token pair rather than rotating the
 * caller's current refresh token — the caller didn't present one here
 * (Bearer access token only), and a user legitimately holding two live
 * sessions (one per context) is the same shape multi-device login already
 * allows, not a new case to guard against.
 *
 * 2026-09-26: the new pair stays in the caller's login session (`sid`), so
 * logging out afterwards revokes both pairs and releases the FCM device the
 * session registered, instead of leaving the pre-switch refresh token as a
 * live, orphaned session that could re-register the device.
 */
@Injectable()
export class SwitchContextUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(RefreshTokenRepository) private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(userId: string, input: SwitchContextInput, sessionId?: string): Promise<SwitchContextResult> {
    if (!sessionId) {
      throw new UnauthenticatedError('SESSION_REFRESH_REQUIRED', 'يلزم تحديث الجلسة قبل تغيير الدور.');
    }
    return this.prisma.$transaction(async (tx) => {
      await this.refreshTokens.lockUserForAuthMutation(tx, userId);
      if (!(await this.refreshTokens.lockLiveSession(tx, userId, sessionId))) {
        throw new DomainError(409, 'DEVICE_SESSION_ENDED', 'انتهت الجلسة الحالية. سجّل الدخول مرة أخرى.');
      }
      const memberships = await this.roleMemberships.findActiveByUser(tx, userId);
      const target = memberships.find((membership) => membership.context_type === input.contextType);

      if (!target) {
        throw new DomainError(403, 'CONTEXT_NOT_AVAILABLE', 'ليس لديك دور نشِط لهذا السياق.');
      }

      const issued = await this.tokens.issue(tx, target, undefined, sessionId);

      return {
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        expiresIn: issued.expiresIn,
      };
    });
  }
}
