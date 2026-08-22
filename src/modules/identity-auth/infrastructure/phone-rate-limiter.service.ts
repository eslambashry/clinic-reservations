import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../../../shared/kernel/redis/redis.service';
import { OTP_CONSTANTS } from '../domain/otp.constants';

/**
 * File 10 §2.3: OTP request is rate-limited **per phone number** ("3
 * requests / 10 min"). Distinct from the global `ThrottlerGuard`
 * (per-IP/per-user, File 12 Part 04) — a phone number isn't a request
 * identity the generic throttler keys on, and this is the specific axis
 * File 10 asks to be limited (prevents SMS-bombing one number from
 * rotating IPs). Fixed-window counter in Redis: simple, correct, and
 * cheap — no need for a sliding-window algorithm at this volume.
 */
@Injectable()
export class PhoneRateLimiterService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  /** Returns true if the request is allowed (and counts it); false if the phone is over its window limit. */
  async consume(phone: string): Promise<boolean> {
    const key = `otp-rate:${phone}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, OTP_CONSTANTS.RATE_LIMIT_WINDOW_SECONDS);
    }
    return count <= OTP_CONSTANTS.RATE_LIMIT_MAX_REQUESTS;
  }
}
