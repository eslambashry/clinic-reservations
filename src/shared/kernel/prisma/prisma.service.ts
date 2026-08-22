import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

/**
 * DI-managed Prisma client for the Nest application (API and worker
 * processes both). `src/db/client.ts`'s plain singleton remains separately
 * for standalone scripts (`db:seed`) that run outside the Nest container —
 * two entrypoints, not two competing patterns.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  // Explicit `@Inject` (not just a typed constructor param): a subclass of
  // `PrismaClient` confuses `tsx`'s decorator-metadata emission for the
  // constructor's `design:paramtypes` (found while booting the app for
  // Phase 2's e2e tests — the first time it was actually run), so Nest
  // resolved `undefined` for `config` instead of throwing a clear "can't
  // resolve dependency" error. Explicit token injection sidesteps that
  // reflection path entirely.
  constructor(@Inject(ConfigService) config: ConfigService) {
    super({
      log: config.get<string>('nodeEnv') === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to Postgres');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
