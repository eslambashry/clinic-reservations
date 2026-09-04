import { Injectable } from '@nestjs/common';
import { Prisma, User, UserStatus } from '@prisma/client';

@Injectable()
export class UserRepository {
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

  setPassword(db: Prisma.TransactionClient, id: string, passwordHash: string): Promise<User> {
    return db.user.update({
      where: { id },
      data: { password_hash: passwordHash, password_updated_at: new Date() },
    });
  }

  setStatus(db: Prisma.TransactionClient, id: string, status: UserStatus): Promise<User> {
    return db.user.update({ where: { id }, data: { status } });
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
