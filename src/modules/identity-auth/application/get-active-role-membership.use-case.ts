import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';

export interface ActiveRoleMembership {
  roleMembershipId: string;
  contextId: string | null;
}

/**
 * File 12 Part 39: the concrete, generic form of the branch-scoped-staff
 * lookup Part 35.8 flagged as missing for clinic-staff appointment access
 * and Part 39.5 decided pharmacy-fulfillment would need built as a
 * contained DB lookup (not a JWT-claims/`RbacGuard` change) — built here
 * for real because pharmacy-fulfillment's broadcast accept/decline is the
 * first caller, but deliberately parameterized by `contextType` rather than
 * named after pharmacy, so any future module with the identical need (e.g.
 * clinic-staff) reuses this instead of duplicating it.
 *
 * Plain `PrismaService` read, not `tx`-scoped — this is an authorization
 * lookup, not something that must share a snapshot with a later write
 * (same shape as `ResolveAffiliationForSchedulingUseCase`).
 *
 * Takes the first `ACTIVE` membership matching `contextType`, same
 * "a user only ever has one active membership per context type in
 * practice" simplification already documented for JWT issuance
 * (`verify-otp.use-case.ts`) — which membership should be "active" once a
 * user can have more than one of the same context type is the same
 * genuinely-unresolved question flagged there, not re-solved here.
 */
@Injectable()
export class GetActiveRoleMembershipUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
  ) {}

  async execute(userId: string, contextType: RoleContextType): Promise<ActiveRoleMembership | null> {
    const memberships = await this.roleMemberships.findActiveByUser(this.prisma, userId);
    const match = memberships.find((membership) => membership.context_type === contextType);
    return match ? { roleMembershipId: match.id, contextId: match.context_id } : null;
  }
}
