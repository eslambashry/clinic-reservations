import { Injectable, Logger } from '@nestjs/common';
import { SmsSenderPort } from '../application/ports/sms-sender.port';

/**
 * Placeholder `SmsSenderPort` implementation — mirrors `identity-auth`'s
 * `LoggingOtpSender` exactly, same reason: no SMS provider is chosen yet
 * (File 10 Part 4 `DEC-003`, still `Open`). Never enable this in production
 * — it would mean a `TRANSACTIONAL`/`SAFETY_CRITICAL` SMS never actually
 * reaches the patient.
 */
@Injectable()
export class LoggingSmsSender implements SmsSenderPort {
  private readonly logger = new Logger(LoggingSmsSender.name);

  async send(phone: string, message: string): Promise<void> {
    this.logger.warn(`[DEV-ONLY SMS DELIVERY] No SMS provider configured (File 10 Part 4 DEC-003 OPEN DECISION) — SMS to ${phone}: ${message}`);
  }
}
