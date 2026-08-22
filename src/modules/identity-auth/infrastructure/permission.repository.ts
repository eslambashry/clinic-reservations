import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class PermissionRepository {
  /** Resolved once at token issuance and embedded in the JWT — see `jwt-payload.interface.ts`. */
  async findCodesByRole(db: Prisma.TransactionClient, roleCode: string): Promise<string[]> {
    const rows = await db.rolePermission.findMany({
      where: { role_code: roleCode },
      select: { permission_code: true },
    });
    return rows.map((row) => row.permission_code);
  }
}
