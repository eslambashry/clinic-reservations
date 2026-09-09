import { Injectable } from '@nestjs/common';
import { NotificationPreference, NotificationTier, Prisma } from '@prisma/client';

@Injectable()
export class NotificationPreferenceRepository {
  listForUser(db: Prisma.TransactionClient, userId: string): Promise<NotificationPreference[]> {
    return db.notificationPreference.findMany({ where: { user_id: userId } });
  }

  /** File 10 §11: `enabled` is meaningless for `SAFETY_CRITICAL` (never honored — see `isUserDisableable`) but still stored as written, so a client's own UI state round-trips even though the backend ignores it for send decisions. */
  upsert(
    db: Prisma.TransactionClient,
    input: { userId: string; tier: NotificationTier; channel: string; enabled: boolean },
  ): Promise<NotificationPreference> {
    return db.notificationPreference.upsert({
      where: { user_id_tier_channel: { user_id: input.userId, tier: input.tier, channel: input.channel } },
      create: { user_id: input.userId, tier: input.tier, channel: input.channel, enabled: input.enabled },
      update: { enabled: input.enabled },
    });
  }
}
