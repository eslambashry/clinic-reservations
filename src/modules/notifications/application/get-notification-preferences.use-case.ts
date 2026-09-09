import { Inject, Injectable } from '@nestjs/common';
import { NotificationTier } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { isUserDisableable } from '../domain/notification-tier-routing.rules';
import { NotificationPreferenceRepository } from '../infrastructure/notification-preference.repository';

export interface NotificationPreferenceView {
  tier: NotificationTier;
  channel: string;
  enabled: boolean;
  /** `false` means `enabled` is purely informational — `SAFETY_CRITICAL` can never actually be turned off, File 10 §11. */
  userDisableable: boolean;
}

/**
 * File 10 §11 / the "Profile & Settings -> notification prefs" screen
 * (File 10 Part 9) needs a read endpoint File 11 Part 05.9 doesn't
 * literally list — added as a minimal, clearly-justified extension (File
 * 12 Part 12: check File 10/11 for the rule, and if neither answers it,
 * make the call explicitly rather than leaving the screen unbuildable).
 * Reports every (tier, channel) combination that actually appears in
 * `NOTIFICATION_TEMPLATES`, not just rows the user has already written —
 * a client needs the full matrix to render toggles, most of which start
 * unset (default-enabled).
 */
@Injectable()
export class GetNotificationPreferencesUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationPreferenceRepository) private readonly preferences: NotificationPreferenceRepository,
  ) {}

  async execute(userId: string): Promise<NotificationPreferenceView[]> {
    const rows = await this.preferences.listForUser(this.prisma, userId);
    const byKey = new Map(rows.map((row) => [`${row.tier}:${row.channel}`, row.enabled]));

    const combinations = new Set<string>();
    const tiersByChannel: { tier: NotificationTier; channel: string }[] = [];
    for (const tier of ['TRANSACTIONAL', 'INFORMATIONAL', 'SAFETY_CRITICAL', 'MARKETING'] as NotificationTier[]) {
      for (const channel of ['PUSH', 'SMS']) {
        const key = `${tier}:${channel}`;
        if (combinations.has(key)) continue;
        combinations.add(key);
        tiersByChannel.push({ tier, channel });
      }
    }

    return tiersByChannel.map(({ tier, channel }) => ({
      tier,
      channel,
      enabled: byKey.get(`${tier}:${channel}`) ?? true,
      userDisableable: isUserDisableable(tier),
    }));
  }
}
