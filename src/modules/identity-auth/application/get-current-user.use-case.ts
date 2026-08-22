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

    return {
      id: user.id,
      phone: user.phone,
      roles: memberships.map((m) => m.role_code),
      activeRole: input.activeRoleCode,
      displayName,
    };
  }
}
