import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';

/**
 * Platform-wide ADMIN fan-out (e.g. "notify every admin a doctor
 * self-registered") — `ADMIN` memberships have no `context_id` to scope by,
 * so this can't reuse the owner/branch-scoped `ListStaffByContextUseCase`.
 */
@Injectable()
export class ListActiveAdminUserIdsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
  ) {}

  async execute(): Promise<string[]> {
    const memberships = await this.roleMemberships.listActiveByRoleContextType(this.prisma, {
      roleCode: 'ADMIN',
      contextType: RoleContextType.ADMIN,
    });
    return memberships.map((m) => m.user_id);
  }
}
