import { Injectable, Logger } from '@nestjs/common';
import { OtpSenderPort } from '../application/ports/otp-sender.port';

/**
 * Placeholder `OtpSenderPort` implementation: logs the code instead of
 * sending an SMS, since no SMS provider is chosen yet (File 10 Part 4 `OPEN
 * DECISION`). This makes the OTP flow genuinely testable end-to-end without
 * pretending an SMS integration exists — never enable this in production
 * (it would mean nobody actually receives their code).
 */
@Injectable()
export class LoggingOtpSender implements OtpSenderPort {
  private readonly logger = new Logger(LoggingOtpSender.name);

  async send(phone: string, code: string): Promise<void> {
    this.logger.warn(
      `[DEV-ONLY OTP DELIVERY] No SMS provider configured (File 10 Part 4 OPEN DECISION) — code for ${phone} is ${code}`,
    );
  }
}
