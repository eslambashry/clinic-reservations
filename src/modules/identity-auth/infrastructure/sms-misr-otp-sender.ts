import { Inject, Injectable } from '@nestjs/common';
import { SmsMisrClient } from '../../../shared/kernel/sms/sms-misr.client';
import { OtpPurpose, OtpSenderPort } from '../application/ports/otp-sender.port';
import { buildOtpMessage } from '../domain/otp-message.util';

/**
 * File 12 Part 54 / `DEC-003`: production `OtpSenderPort`. With an approved
 * OTP template configured, login/signup and password-reset codes share that
 * one template (user decision, 2026-09-30) and `purpose` is ignored. Until
 * then, the code goes out as free text through SMS Misr's SMS API.
 */
@Injectable()
export class SmsMisrOtpSender implements OtpSenderPort {
  constructor(@Inject(SmsMisrClient) private readonly smsMisr: SmsMisrClient) {}

  async send(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    if (this.smsMisr.hasOtpTemplate()) {
      await this.smsMisr.sendOtp(phone, code);
    } else {
      await this.smsMisr.sendSms(phone, buildOtpMessage(code, purpose));
    }
  }
}
