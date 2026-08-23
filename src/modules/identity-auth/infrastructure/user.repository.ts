import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class UserRepository {
  findById(db: Prisma.TransactionClient, id: string): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  }

  findByPhone(db: Prisma.TransactionClient, phone: string): Promise<User | null> {
    return db.user.findUnique({ where: { phone } });
  }

  create(db: Prisma.TransactionClient, phone: string): Promise<User> {
    return db.user.create({ data: { phone } });
  }

  setPassword(db: Prisma.TransactionClient, id: string, passwordHash: string): Promise<User> {
    return db.user.update({
      where: { id },
      data: { password_hash: passwordHash, password_updated_at: new Date() },
    });
  }
}
