import { Inject, Injectable } from '@nestjs/common';
import { NotificationTier } from '@prisma/client';
import { BusinessRuleError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { isUserDisableable } from '../domain/notification-tier-routing.rules';
import { NotificationPreferenceRepository } from '../infrastructure/notification-preference.repository';

export interface UpdateNotificationPreferenceInput {
  tier: NotificationTier;
  channel: string;
  enabled: boolean;
}

/** File 10 §11's hard rule enforced server-side, not just left to the client UI to grey out: `SAFETY_CRITICAL` can never be disabled. */
@Injectable()
export class UpdateNotificationPreferencesUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationPreferenceRepository) private readonly preferences: NotificationPreferenceRepository,
  ) {}

  async execute(userId: string, inputs: UpdateNotificationPreferenceInput[]): Promise<void> {
    for (const input of inputs) {
      if (!input.enabled && !isUserDisableable(input.tier)) {
        throw new BusinessRuleError('SAFETY_CRITICAL_NOTIFICATION_NOT_DISABLEABLE', 'لا يمكن تعطيل الإشعارات الحرِجة المتعلقة بسلامتك.', {
          tier: input.tier,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const input of inputs) {
        await this.preferences.upsert(tx, { userId, tier: input.tier, channel: input.channel, enabled: input.enabled });
      }
    });
  }
}
