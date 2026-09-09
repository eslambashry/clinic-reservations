import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DeviceRepository } from '../infrastructure/device.repository';

/**
 * File 12 Part 53: the one read `notifications` needs from `identity-auth`
 * — exported instead of `DeviceRepository` directly (File 12 Part 05: a
 * module is only called through another module's exported application-layer
 * service, never by reaching into its `infrastructure/`). Accepts an
 * optional `tx` so a caller already inside a transaction (there usually
 * isn't one here — dispatch runs from the worker, outside any request
 * transaction) can still pass it through for consistency.
 */
@Injectable()
export class ListUserDeviceTokensUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DeviceRepository) private readonly devices: DeviceRepository,
  ) {}

  execute(userId: string, tx?: Prisma.TransactionClient): Promise<string[]> {
    return this.devices.listTokensForUser(tx ?? this.prisma, userId);
  }
}
