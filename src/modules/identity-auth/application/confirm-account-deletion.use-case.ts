import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { validateOtpCode } from '../domain/otp-verification.util';
import { OtpRequestRepository } from '../infrastructure/otp-request.repository';
import { UserRepository } from '../infrastructure/user.repository';
import { DeleteAccountUseCase } from './delete-account.use-case';

export interface ConfirmAccountDeletionInput {
  requestId: string;
  code: string;
}

const ACCOUNT_DELETION_PURPOSE = 'ACCOUNT_DELETION';

/**
 * Verifies the ACCOUNT_DELETION OTP (proof the caller controls the phone),
 * then runs the same soft-delete + anonymise as the in-app flow. The OTP is
 * consumed only after a successful deletion, so a 409 (open appointments /
 * wallet balance) can be retried with the same code until it expires.
 */
@Injectable()
export class ConfirmAccountDeletionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OtpRequestRepository) private readonly otpRequests: OtpRequestRepository,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(DeleteAccountUseCase) private readonly deleteAccount: DeleteAccountUseCase,
  ) {}

  async execute(input: ConfirmAccountDeletionInput): Promise<void> {
    const otpRequest = await this.otpRequests.findById(this.prisma, input.requestId);
    await validateOtpCode(otpRequest, { code: input.code, purpose: ACCOUNT_DELETION_PURPOSE }, (id) =>
      this.otpRequests.incrementAttempts(this.prisma, id),
    );

    const user = await this.users.findByPhone(this.prisma, otpRequest!.phone);
    if (!user || user.deleted_at) {
      throw new DomainError(400, 'INVALID_CODE', 'رمز التحقق غير صحيح. راجع الرمز وأعد المحاولة.');
    }

    await this.deleteAccount.execute(user.id);
    await this.otpRequests.markConsumed(this.prisma, otpRequest!.id);
  }
}
