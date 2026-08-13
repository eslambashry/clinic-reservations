import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { generateOtpCode, hashOtpCode } from '../domain/otp-code.util';
import { OTP_CONSTANTS } from '../domain/otp.constants';
import { OtpRequestRepository } from '../infrastructure/otp-request.repository';
import { PhoneRateLimiterService } from '../infrastructure/phone-rate-limiter.service';
import { OTP_SENDER, OtpSenderPort } from './ports/otp-sender.port';

export interface RequestOtpInput {
  phone: string;
  /** For the File 10 §2.3 security log (request attempt: phone, ip, timestamp) — not stored in `otp_requests`. */
  ip?: string;
}

export interface RequestOtpResult {
  requestId: string;
  expiresInSeconds: number;
}

/** No separate signup flow — OTP is unified login/signup (File 11 07.1). */
const OTP_PURPOSE = 'LOGIN_OR_SIGNUP';

@Injectable()
export class RequestOtpUseCase {
  private readonly logger = new Logger(RequestOtpUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpRequests: OtpRequestRepository,
    private readonly rateLimiter: PhoneRateLimiterService,
    @Inject(OTP_SENDER) private readonly otpSender: OtpSenderPort,
  ) {}

  async execute(input: RequestOtpInput): Promise<RequestOtpResult> {
    const allowed = await this.rateLimiter.consume(input.phone);
    if (!allowed) {
      throw new DomainError(
        429,
        'RATE_LIMITED',
        'Too many OTP requests for this phone number — try again later.',
      );
    }

    const code = generateOtpCode();
    const codeHash = await hashOtpCode(code);
    const expiresAt = new Date(Date.now() + OTP_CONSTANTS.EXPIRES_IN_SECONDS * 1000);

    // No multi-write atomicity concern here (one row) — no transaction needed.
    const otpRequest = await this.otpRequests.create(this.prisma, {
      phone: input.phone,
      codeHash,
      purpose: OTP_PURPOSE,
      expiresAt,
    });

    await this.otpSender.send(input.phone, code);

    // Security log (File 10 §2.3) — deliberately not a PHI/audit_logs row.
    this.logger.log(`OTP requested for ${input.phone} from ${input.ip ?? 'unknown-ip'}`);

    return { requestId: otpRequest.id, expiresInSeconds: OTP_CONSTANTS.EXPIRES_IN_SECONDS };
  }
}
