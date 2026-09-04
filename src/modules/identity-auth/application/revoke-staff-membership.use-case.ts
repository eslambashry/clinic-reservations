import { Inject, Injectable } from '@nestjs/common';
import { Prisma, RoleContextType } from '@prisma/client';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';

export interface RevokeStaffMembershipInput {
  roleMembershipId: string;
  roleCode: string;
  contextType: RoleContextType;
  contextId: string;
}

/**
 * Soft-deactivation: flips the `RoleMembership` to REVOKED — never a
 * physical delete (File 12 Part 05's soft-delete convention). Deliberately
 * does not also touch `User.status`: the `RoleMembership` row is the only
 * thing scoped to this owner, and revoking it already makes
 * `RoleMembershipRepository.findActiveByUser` (consulted by
 * `LoginWithPasswordUseCase`) stop returning this context on the next
 * login — touching `User.status` instead would collaterally suspend any
 * *other* role the same phone might hold (e.g. a PATIENT membership),
 * which is not this action's scope.
 */
@Injectable()
export class RevokeStaffMembershipUseCase {
  constructor(@Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository) {}

  async execute(tx: Prisma.TransactionClient, input: RevokeStaffMembershipInput): Promise<void> {
    const membership = await this.roleMemberships.findByIdForContext(tx, {
      id: input.roleMembershipId,
      roleCode: input.roleCode,
      contextType: input.contextType,
      contextId: input.contextId,
    });
    if (!membership) {
      throw new NotFoundError('Assistant', input.roleMembershipId);
    }

    await this.roleMemberships.setStatus(tx, membership.id, membership.version, 'REVOKED');
  }
}
