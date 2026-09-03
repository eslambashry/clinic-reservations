import { Injectable } from '@nestjs/common';
import { Prisma, RoleContextType, RoleMembership } from '@prisma/client';

@Injectable()
export class RoleMembershipRepository {
  /**
   * Ordered most-recent-first: every "pick the active one" call site
   * (`VerifyOtpUseCase`, `RefreshTokenUseCase`) takes `memberships[0]` —
   * this ordering is what makes a newly-granted membership (e.g. DOCTOR,
   * granted on Admin verification via `GrantRoleMembershipUseCase`) win
   * over an older one (e.g. the original PATIENT membership from
   * self-registration) at the next login/refresh. File 11 doesn't resolve
   * which membership should be "active" when a user holds more than one —
   * this is the concrete choice made in its absence, not a documented spec.
   */
  findActiveByUser(db: Prisma.TransactionClient, userId: string): Promise<RoleMembership[]> {
    return db.roleMembership.findMany({
      where: { user_id: userId, status: 'ACTIVE' },
      orderBy: { created_at: 'desc' },
    });
  }

  create(
    db: Prisma.TransactionClient,
    params: { userId: string; roleCode: string; contextType: RoleContextType },
  ): Promise<RoleMembership> {
    return db.roleMembership.create({
      data: { user_id: params.userId, role_code: params.roleCode, context_type: params.contextType },
    });
  }
}
