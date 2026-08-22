import { Injectable } from '@nestjs/common';
import { Prisma, RoleContextType, RoleMembership } from '@prisma/client';

@Injectable()
export class RoleMembershipRepository {
  findActiveByUser(db: Prisma.TransactionClient, userId: string): Promise<RoleMembership[]> {
    return db.roleMembership.findMany({ where: { user_id: userId, status: 'ACTIVE' } });
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
