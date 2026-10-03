import { Inject, Injectable } from '@nestjs/common';
import { Prisma, User, UserStatus } from '@prisma/client';
import { ConflictError } from '../../../shared/core/errors/domain-errors';
import { hasStaffIdentityConflict } from '../domain/staff-identity.rules';
import { RefreshTokenRepository } from './refresh-token.repository';
import { DeviceRepository } from './device.repository';

@Injectable()
export class UserRepository {
  constructor(
    @Inject(RefreshTokenRepository) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(DeviceRepository) private readonly devices: DeviceRepository,
  ) {}

  lockForAuthMutation(db: Prisma.TransactionClient, userId: string): Promise<void> {
    return this.refreshTokens.lockUserForAuthMutation(db, userId);
  }
  findById(db: Prisma.TransactionClient, id: string): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  }

  findByPhone(db: Prisma.TransactionClient, phone: string): Promise<User | null> {
    return db.user.findUnique({ where: { phone } });
  }

  /** `firstName` is optional so the existing OTP-signup call site (no name collected) is unaffected. */
  create(db: Prisma.TransactionClient, phone: string, firstName?: string): Promise<User> {
    return db.user.create({ data: { phone, first_name: firstName } });
  }

  async setPassword(db: Prisma.TransactionClient, id: string, passwordHash: string): Promise<User> {
    await this.lockForAuthMutation(db, id);
    const history = await db.roleMembership.findMany({ where: { user_id: id } });
    if (hasStaffIdentityConflict(history)) {
      throw new ConflictError('STAFF_IDENTITY_CONFLICT', 'يجب استخدام حساب موظف مستقل عن الحسابات الشخصية والجهات الأخرى.');
    }
    return db.user.update({
      where: { id },
      data: { password_hash: passwordHash, password_updated_at: new Date() },
    });
  }

  async setStatus(db: Prisma.TransactionClient, id: string, status: UserStatus): Promise<User> {
    await this.lockForAuthMutation(db, id);
    const user = await db.user.update({ where: { id }, data: { status } });
    if (status !== 'ACTIVE') {
      await this.refreshTokens.revokeAllActiveForUser(db, id);
      await this.devices.deleteAllForUser(db, id);
    }
    return user;
  }

  updateProfile(
    db: Prisma.TransactionClient,
    id: string,
    input: { firstName?: string; lastName?: string; email?: string },
  ): Promise<User> {
    return db.user.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined && { first_name: input.firstName }),
        ...(input.lastName !== undefined && { last_name: input.lastName }),
        ...(input.email !== undefined && { email: input.email }),
      },
    });
  }
}
