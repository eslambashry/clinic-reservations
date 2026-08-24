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

  /**
   * Returns true if the request is allowed (and counts it); false if the
   * phone is over its window limit. Defaults preserve the original
   * OTP-request behavior (`otp-rate:` prefix, OTP_CONSTANTS' limits) —
   * pass `opts` to rate-limit a different phone-keyed action (e.g.
   * password-login attempts) under its own key/window/max.
   */
  async consume(
    phone: string,
    opts?: { keyPrefix?: string; maxRequests?: number; windowSeconds?: number },
  ): Promise<boolean> {
    const keyPrefix = opts?.keyPrefix ?? 'otp-rate';
    const maxRequests = opts?.maxRequests ?? OTP_CONSTANTS.RATE_LIMIT_MAX_REQUESTS;
    const windowSeconds = opts?.windowSeconds ?? OTP_CONSTANTS.RATE_LIMIT_WINDOW_SECONDS;

    const key = `${keyPrefix}:${phone}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, windowSeconds);
    }
    return count <= maxRequests;
  }
}
