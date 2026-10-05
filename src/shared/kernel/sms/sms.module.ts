import { Global, Module } from '@nestjs/common';
import { SmsMisrClient } from './sms-misr.client';

/**
 * Global, like `MediaStorageModule`, so the SMS Misr client lives in the
 * shared kernel rather than inside one domain module. Today only
 * `identity-auth`'s OTP sender uses it (File 12 Part 54: OTP-only); which
 * OTP sender is bound is decided by `SMS_PROVIDER` in
 * `identity-auth.module.ts`, not here.
 */
@Global()
@Module({
  providers: [SmsMisrClient],
  exports: [SmsMisrClient],
})
export class SmsModule {}
