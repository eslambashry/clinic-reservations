import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { OTP_CONSTANTS } from '../domain/otp.constants';
import { UserRepository } from '../infrastructure/user.repository';
import { RequestOtpResult, RequestOtpUseCase } from './request-otp.use-case';

export interface RequestAccountDeletionOtpInput {
  phone: string;
  ip?: string;
}

const ACCOUNT_DELETION_PURPOSE = 'ACCOUNT_DELETION';

/**
 * Public (website) entry point for deleting an account without the app.
 * Reuses `RequestOtpUseCase` (rate limit, hashing, SMS) with its own purpose.
 *
 * Does not reveal whether the phone has an account: for an unknown or already
 * deleted phone it sends no SMS and returns a throwaway requestId, so the
 * response is shaped the same either way. Such an id can never be confirmed.
 */
@Injectable()
export class RequestAccountDeletionOtpUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(RequestOtpUseCase) private readonly requestOtp: RequestOtpUseCase,
  ) {}

  async execute(input: RequestAccountDeletionOtpInput): Promise<RequestOtpResult> {
    const user = await this.users.findByPhone(this.prisma, input.phone);
    if (!user || user.deleted_at) {
      return { requestId: randomUUID(), expiresInSeconds: OTP_CONSTANTS.EXPIRES_IN_SECONDS };
    }
    return this.requestOtp.execute({ phone: input.phone, ip: input.ip, purpose: ACCOUNT_DELETION_PURPOSE });
  }
}
