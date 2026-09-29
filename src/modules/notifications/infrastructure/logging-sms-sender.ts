import { Injectable } from '@nestjs/common';
import { SmsChannelUnavailableError, SmsSenderPort } from '../application/ports/sms-sender.port';

/**
 * Placeholder `SmsSenderPort` binding while no SMS provider is chosen (File
 * 10 Part 4 `DEC-003`, still `Open`). Unlike `identity-auth`'s dev-only
 * `LoggingOtpSender`, it never pretends to deliver: a `TRANSACTIONAL`/
 * `SAFETY_CRITICAL` SMS row must end `FAILED`, not `SENT`, when nothing
 * reached the patient — and the phone number and clinical text stay out of
 * application logs. Swap the `SMS_SENDER` binding once a provider exists.
 */
@Injectable()
export class LoggingSmsSender implements SmsSenderPort {
  async send(_phone: string, _message: string): Promise<void> {
    throw new SmsChannelUnavailableError();
  }
}
