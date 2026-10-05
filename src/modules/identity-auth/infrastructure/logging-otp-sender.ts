import { Injectable, Logger } from '@nestjs/common';
import { OtpPurpose, OtpSenderPort } from '../application/ports/otp-sender.port';

/**
 * Dev-only `OtpSenderPort`, bound when `SMS_PROVIDER` is unset/`logging`:
 * logs the code instead of sending an SMS, so the OTP flow stays testable
 * locally without SMS Misr credentials. Production boot refuses to start
 * without `SMS_PROVIDER=smsmisr` (`env.validation.ts`), so this can never
 * silently swallow real users' codes.
 */
@Injectable()
export class LoggingOtpSender implements OtpSenderPort {
  private readonly logger = new Logger(LoggingOtpSender.name);

  async send(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    this.logger.warn(`[DEV-ONLY OTP DELIVERY] SMS_PROVIDER is not smsmisr — ${purpose} code for ${phone} is ${code}`);
  }
}
