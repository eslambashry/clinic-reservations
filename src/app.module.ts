import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { IdentityAuthModule } from './modules/identity-auth/identity-auth.module';
import { ProviderDirectoryModule } from './modules/provider-directory/provider-directory.module';
import { AppConfigModule } from './shared/config/config.module';
import { CoreModule } from './shared/core/core.module';
import { PrismaModule } from './shared/kernel/prisma/prisma.module';
import { RedisModule } from './shared/kernel/redis/redis.module';

/**
 * Root module shared by both process entrypoints (`main.ts` — API,
 * `worker.ts` — background jobs, via `WorkerModule`), per File 12 Part 06.
 * Domain modules get added here one at a time as each is built, following
 * File 12 Part 10's phase order — Identity (Phase 1), Provider Directory
 * (Phase 2).
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    CoreModule,
    HealthModule,
    IdentityAuthModule,
    ProviderDirectoryModule,
  ],
})
export class AppModule {}
