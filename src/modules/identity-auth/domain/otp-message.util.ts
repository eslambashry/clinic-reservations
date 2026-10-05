import { OTP_CONSTANTS } from './otp.constants';

type OtpMessagePurpose = 'LOGIN_OR_SIGNUP' | 'PASSWORD_RESET';

const EXPIRES_IN_MINUTES = Math.round(OTP_CONSTANTS.EXPIRES_IN_SECONDS / 60);

/**
 * OTP text for providers that take free text — used by `SmsMisrOtpSender`
 * only while no approved SMS Misr OTP template is configured (File 12 Part
 * 54). Kept within one SMS: Arabic is UCS-2, so one segment is 70 chars.
 */
export function buildOtpMessage(code: string, purpose: OtpMessagePurpose): string {
  const action = purpose === 'PASSWORD_RESET' ? 'لتغيير كلمة المرور' : 'للدخول';
  return `رمز MedSuper ${action}: ${code}\nصالح ${EXPIRES_IN_MINUTES} دقائق. لا تشاركه.`;
}
