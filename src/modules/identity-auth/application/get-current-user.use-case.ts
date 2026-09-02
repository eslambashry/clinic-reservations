import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';
import { UserRepository } from '../infrastructure/user.repository';

export interface GetCurrentUserInput {
  userId: string;
  activeRoleCode: string;
}

export interface GetCurrentUserResult {
  id: string;
  phone: string;
  roles: string[];
  activeRole: string;
  displayName: string | null;
  email: string | null;
  /**
   * The active membership's own scope id (e.g. a pharmacy branch id for
   * PHARMACY_STAFF) — null for context types with no scope (PATIENT).
   * Not carried in the JWT itself (`AccessTokenPayload` has no `contextId`,
   * only `roleMembershipId`); every use-case that needs it re-resolves it
   * server-side from the membership row instead (`GetActiveRoleMembershipUseCase`).
   * Added 2026-08-29 so a staff client can display which branch it's acting
   * as without a second round trip through that use-case itself.
   */
  contextId: string | null;
}

@Injectable()
export class GetCurrentUserUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
  ) {}

  async execute(input: GetCurrentUserInput): Promise<GetCurrentUserResult> {
    const user = await this.users.findById(this.prisma, input.userId);
    if (!user) {
      throw new NotFoundError('User', input.userId);
    }

    const memberships = await this.roleMemberships.findActiveByUser(this.prisma, user.id);
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
    const activeMembership = memberships.find((m) => m.role_code === input.activeRoleCode);

    return {
      id: user.id,
      phone: user.phone,
      roles: memberships.map((m) => m.role_code),
      activeRole: input.activeRoleCode,
      displayName,
      email: user.email,
      contextId: activeMembership?.context_id ?? null,
    };
  }
}
