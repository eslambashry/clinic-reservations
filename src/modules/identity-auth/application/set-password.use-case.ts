import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from '@node-rs/argon2';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { UserRepository } from '../infrastructure/user.repository';

export interface SetPasswordInput {
  userId: string;
  password: string;
}

export type SetPasswordResult = void;

@Injectable()
export class SetPasswordUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UserRepository) private readonly users: UserRepository,
  ) {}

  async execute(input: SetPasswordInput): Promise<SetPasswordResult> {
    const passwordHash = await argon2.hash(input.password);
    await this.users.setPassword(this.prisma, input.userId, passwordHash);
  }
}
