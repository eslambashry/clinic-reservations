import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class UserRepository {
  findByPhone(db: Prisma.TransactionClient, phone: string): Promise<User | null> {
    return db.user.findUnique({ where: { phone } });
  }

  create(db: Prisma.TransactionClient, phone: string): Promise<User> {
    return db.user.create({ data: { phone } });
  }
}
