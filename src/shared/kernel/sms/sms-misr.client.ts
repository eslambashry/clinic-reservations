import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { DomainError, ExternalProviderError } from '../../core/errors/domain-errors';

const SMS_MISR_BASE_URL = 'https://smsmisr.com/api';
const REQUEST_TIMEOUT_MS = 10_000;

/** SMS Misr's `environment` parameter: `2` = test (no delivery, no charge), `1` = live. */
const ENVIRONMENT_CODE = { test: '2', live: '1' } as const;

/** SMS Misr's `language` parameter for the SMS API; `2` = Arabic (UCS-2). */
const ARABIC_LANGUAGE = '2';

const OTP_SUCCESS_CODE = '4901';
const SMS_SUCCESS_CODE = '1901';

/**
 * Failure codes, for the log line only. `4903`, `4909`, and `1905` were
 * confirmed against the real API on 2026-09-30/10-01; the rest follow SMS
 * Misr's API reference.
 */
const FAILURE_REASONS: Readonly<Record<string, string>> = {
  '4903': 'invalid API username/password',
  '4904': 'invalid sender token',
  '4905': 'invalid mobile number',
  '4906': 'insufficient balance',
  '4907': 'SMS Misr server updating',
  '4908': 'invalid OTP value',
  '4909': 'invalid or unapproved OTP template',
  '4912': 'invalid environment',
  '1902': 'invalid request',
  '1903': 'invalid API username/password',
  '1904': 'invalid sender token',
  '1905': 'invalid mobile number',
  '1906': 'insufficient balance',
  '1907': 'SMS Misr server updating',
};

/**
 * File 12 Part 54 / `DEC-003`: the only class that talks to SMS Misr, used
 * by `identity-auth`'s `SmsMisrOtpSender` for OTP only. `sendOtp` uses the
 * OTP API (approved template + code); `sendSms` uses the SMS API (free
 * text), which covers OTP while the template is still pending approval.
 * Plain `fetch`, no SDK (same as the Paymob adapter). Never logs the code,
 * the message body, or the credentials.
 */
@Injectable()
export class SmsMisrClient {
  private readonly logger = new Logger(SmsMisrClient.name);
  private readonly config: AppConfig['sms']['smsMisr'];

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.config = configService.get<AppConfig['sms']>('sms')?.smsMisr as AppConfig['sms']['smsMisr'];
  }

  hasOtpTemplate(): boolean {
    return Boolean(this.config.otpTemplate);
  }

  async sendOtp(phone: string, otp: string): Promise<void> {
    await this.post('OTP', OTP_SUCCESS_CODE, phone, { template: this.config.otpTemplate ?? '', otp });
  }

  async sendSms(phone: string, message: string): Promise<void> {
    await this.post('SMS', SMS_SUCCESS_CODE, phone, { language: ARABIC_LANGUAGE, message });
  }

  private async post(api: 'OTP' | 'SMS', successCode: string, phone: string, fields: Record<string, string>): Promise<void> {
    const { username, password, sender, environment } = this.config;
    if (!username || !password || !sender || (api === 'OTP' && !this.config.otpTemplate)) {
      throw new DomainError(500, 'SMS_PROVIDER_NOT_CONFIGURED', 'خدمة الرسائل النصية غير مُهيّأة حاليًا. تواصل مع الدعم.');
    }

    const form = new URLSearchParams({
      environment: ENVIRONMENT_CODE[environment],
      username,
      password,
      sender,
      mobile: toSmsMisrMobile(phone),
      ...fields,
    });

    let code: string | undefined;
    try {
      const response = await fetch(`${SMS_MISR_BASE_URL}/${api}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const payload = (await response.json().catch(() => ({}))) as { code?: string | number; Message?: string };
      code = payload.code === undefined ? undefined : String(payload.code);
      if (code !== successCode) {
        const reason = (code && FAILURE_REASONS[code]) ?? payload.Message ?? 'unknown response';
        throw new Error(`SMS Misr ${api} API responded ${response.status} code=${code ?? 'none'}: ${reason}`);
      }
    } catch (error) {
      // `Error` serializes to `{}` in Nest's logger, so log the message explicitly.
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error({ reason, api, to: maskPhone(phone), code }, 'SMS Misr send failed');
      throw new ExternalProviderError('SMS Misr', 502, error);
    }

    this.logger.log(`OTP queued to ${maskPhone(phone)} via SMS Misr ${api} API (${environment})`);
  }
}

/** Our phones are E.164 (`+201XXXXXXXXX`, `RequestOtpDto`); SMS Misr takes the same digits without the `+`. */
export function toSmsMisrMobile(phone: string): string {
  return phone.startsWith('+') ? phone.slice(1) : phone;
}

function maskPhone(phone: string): string {
  return phone.length > 4 ? `${phone.slice(0, 4)}****${phone.slice(-3)}` : '****';
}
