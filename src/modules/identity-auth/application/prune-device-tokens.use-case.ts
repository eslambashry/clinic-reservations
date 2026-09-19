import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DeviceRepository } from '../infrastructure/device.repository';

/**
 * The write counterpart to `ListUserDeviceTokensUseCase`: removes device
 * rows FCM has reported as permanently unregistered. Exported for the same
 * reason (File 12 Part 05 — `notifications` calls an application-layer
 * service, never `DeviceRepository` directly).
 *
 * Without this, `PushSendResult.invalidTokens` was computed on every send
 * and then dropped, so dead tokens accumulated forever and every push kept
 * paying for them.
 */
@Injectable()
export class PruneDeviceTokensUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DeviceRepository) private readonly devices: DeviceRepository,
  ) {}

  async execute(fcmTokens: string[], tx?: Prisma.TransactionClient): Promise<number> {
    if (fcmTokens.length === 0) {
      return 0;
    }
    const result = await this.devices.deleteByTokens(tx ?? this.prisma, fcmTokens);
    return result.count;
  }
}
