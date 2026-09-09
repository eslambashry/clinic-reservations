import { Injectable } from '@nestjs/common';
import { Device, Prisma } from '@prisma/client';

export interface RegisterDeviceInput {
  userId: string;
  fcmToken: string;
  platform: string;
  appVersion?: string;
}

@Injectable()
export class DeviceRepository {
  findByUserAndToken(db: Prisma.TransactionClient, userId: string, fcmToken: string): Promise<Device | null> {
    return db.device.findFirst({ where: { user_id: userId, fcm_token: fcmToken } });
  }

  create(db: Prisma.TransactionClient, input: RegisterDeviceInput): Promise<Device> {
    return db.device.create({
      data: { user_id: input.userId, fcm_token: input.fcmToken, platform: input.platform, app_version: input.appVersion },
    });
  }

  touch(db: Prisma.TransactionClient, id: string, platform: string, appVersion?: string): Promise<Device> {
    return db.device.update({
      where: { id },
      data: { platform, app_version: appVersion, last_seen_at: new Date(), version: { increment: 1 } },
    });
  }

  /** File 12 Part 53: the only read Notifications needs — every currently-known `fcm_token` for a user, across however many devices they're logged into. */
  listTokensForUser(db: Prisma.TransactionClient, userId: string): Promise<string[]> {
    return db.device
      .findMany({ where: { user_id: userId }, select: { fcm_token: true } })
      .then((rows) => rows.map((row) => row.fcm_token));
  }
}
