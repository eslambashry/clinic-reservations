import { Inject, Injectable } from '@nestjs/common';
import { Prisma, RoleContextType, UserStatus } from '@prisma/client';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';
import { UserRepository } from '../infrastructure/user.repository';
import { StaffMember } from './list-staff-by-context.use-case';

export interface UpdateStaffMembershipInput {
  roleMembershipId: string;
  roleCode: string;
  contextType: RoleContextType;
  contextId: string;
  displayName?: string;
  status?: UserStatus;
}

/**
 * Ownership-scoped staff update (display name / ACTIVE-SUSPENDED status).
 * `contextId` is part of the lookup itself (`findByIdForContext`), so an
 * owner supplying another owner's `roleMembershipId` gets `NotFoundError`
 * (404) — never a 403 that would confirm the id exists at all (IDOR
 * prevention, same convention as the public doctor-detail 404-for-PENDING
 * behavior).
 */
@Injectable()
export class UpdateStaffMembershipUseCase {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
  ) {}

  async execute(tx: Prisma.TransactionClient, input: UpdateStaffMembershipInput): Promise<StaffMember> {
    const membership = await this.roleMemberships.findByIdForContext(tx, {
      id: input.roleMembershipId,
      roleCode: input.roleCode,
      contextType: input.contextType,
      contextId: input.contextId,
    });
    if (!membership) {
      throw new NotFoundError('Assistant', input.roleMembershipId);
    }

    let user = membership.user;
    if (input.displayName !== undefined) {
      user = await this.users.updateProfile(tx, user.id, { firstName: input.displayName });
    }
    if (input.status !== undefined) {
      user = await this.users.setStatus(tx, user.id, input.status);
    }

    return {
      roleMembershipId: membership.id,
      userId: user.id,
      phone: user.phone,
      displayName: user.first_name,
      status: user.status,
      createdAt: membership.created_at,
    };
  }
}
