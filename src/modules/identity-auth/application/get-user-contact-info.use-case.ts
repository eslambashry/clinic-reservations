import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { UserRepository } from '../infrastructure/user.repository';

export interface UserContactInfo {
  phone: string;
}

/**
 * File 12 Part 53: distinct from `GetUserSummaryUseCase` (which masks the
 * phone for display) — this returns the real, unmasked phone number,
 * needed only by `notifications`' SMS channel to actually send a message.
 * Never expose this projection to a client-facing response; it exists
 * purely for a server-to-gateway call.
 */
@Injectable()
export class GetUserContactInfoUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UserRepository) private readonly users: UserRepository,
  ) {}

  async execute(userId: string): Promise<UserContactInfo | null> {
    const user = await this.users.findById(this.prisma, userId);
    return user ? { phone: user.phone } : null;
  }
}
