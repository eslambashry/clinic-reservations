import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DeviceRepository } from '../infrastructure/device.repository';

export interface RegisterDeviceInput {
  userId: string;
  fcmToken: string;
  platform: string;
  appVersion?: string;
}

export interface RegisterDeviceResult {
  deviceId: string;
}

/**
 * File 12 Part 53 `POST /v1/auth/devices` — the piece Push notifications
 * were structurally missing: `devices.fcm_token` existed in the schema but
 * no endpoint ever wrote to it, so `NotificationsModule`'s FCM adapter
 * would have had zero recipients regardless of how correct it was.
 * Upsert-by-`(user_id, fcm_token)`: re-registering the same physical
 * device (app relaunch, token unchanged) touches `last_seen_at` instead of
 * creating a duplicate row that would otherwise double-send every push.
 */
@Injectable()
export class RegisterDeviceUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DeviceRepository) private readonly devices: DeviceRepository,
  ) {}

  async execute(input: RegisterDeviceInput): Promise<RegisterDeviceResult> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.devices.findByUserAndToken(tx, input.userId, input.fcmToken);
      if (existing) {
        const touched = await this.devices.touch(tx, existing.id, input.platform, input.appVersion);
        return { deviceId: touched.id };
      }
      const created = await this.devices.create(tx, input);
      return { deviceId: created.id };
    });
  }
}
