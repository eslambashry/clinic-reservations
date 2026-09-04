import { Injectable } from '@nestjs/common';
import { Prisma, RoleContextType, RoleMembership, RoleMembershipStatus } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

const WITH_USER = { user: true } satisfies Prisma.RoleMembershipInclude;
export type RoleMembershipWithUser = Prisma.RoleMembershipGetPayload<{ include: typeof WITH_USER }>;

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

  findActiveById(db: Prisma.TransactionClient, id: string): Promise<RoleMembership | null> {
    return db.roleMembership.findFirst({ where: { id, status: 'ACTIVE' } });
  }

  create(
    db: Prisma.TransactionClient,
    params: { userId: string; roleCode: string; contextType: RoleContextType; contextId?: string },
  ): Promise<RoleMembership> {
    return db.roleMembership.create({
      data: {
        user_id: params.userId,
        role_code: params.roleCode,
        context_type: params.contextType,
        context_id: params.contextId,
      },
    });
  }

  /** Any status — used to detect a duplicate-create attempt vs. a re-provision of a previously revoked staff member. */
  findByUserRoleContext(
    db: Prisma.TransactionClient,
    params: { userId: string; roleCode: string; contextType: RoleContextType; contextId: string },
  ): Promise<RoleMembership | null> {
    return db.roleMembership.findFirst({
      where: {
        user_id: params.userId,
        role_code: params.roleCode,
        context_type: params.contextType,
        context_id: params.contextId,
      },
    });
  }

  /** ACTIVE only, any `contextId` — used to detect "this phone is already staff for a different owner." */
  findActiveByUserRoleContextType(
    db: Prisma.TransactionClient,
    params: { userId: string; roleCode: string; contextType: RoleContextType },
  ): Promise<RoleMembership[]> {
    return db.roleMembership.findMany({
      where: { user_id: params.userId, role_code: params.roleCode, context_type: params.contextType, status: 'ACTIVE' },
    });
  }

  /** Owner-scoped listing (e.g. a doctor's assistants), joined with the staff member's own `User` row. */
  listByContext(
    db: Prisma.TransactionClient,
    params: { roleCode: string; contextType: RoleContextType; contextId: string },
  ): Promise<RoleMembershipWithUser[]> {
    return db.roleMembership.findMany({
      where: { role_code: params.roleCode, context_type: params.contextType, context_id: params.contextId, status: 'ACTIVE' },
      include: WITH_USER,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Ownership-scoped single lookup (IDOR prevention): a row only comes back
   * if `id` AND `contextId` both match, so a caller probing another owner's
   * membership id gets `null` — a 404 upstream, never a 403 that would
   * confirm the id exists at all.
   */
  findByIdForContext(
    db: Prisma.TransactionClient,
    params: { id: string; roleCode: string; contextType: RoleContextType; contextId: string },
  ): Promise<RoleMembershipWithUser | null> {
    return db.roleMembership.findFirst({
      where: {
        id: params.id,
        role_code: params.roleCode,
        context_type: params.contextType,
        context_id: params.contextId,
        status: 'ACTIVE',
      },
      include: WITH_USER,
    });
  }

  async setStatus(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    status: RoleMembershipStatus,
  ): Promise<void> {
    await updateWithOptimisticLock(db.roleMembership, id, currentVersion, { status });
  }
}
