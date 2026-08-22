import { Global, Module } from '@nestjs/common';
import { PolicyConfigReader } from './policy-config.reader';

/**
 * Global so any domain module can read `policy_configs` (commission rate,
 * cancellation fee tiers, ...) without each declaring its own import — same
 * pattern as `PrismaModule`/`OutboxModule`. Read-only; see
 * `PolicyConfigReader`'s own doc comment for why there's no write side yet.
 */
@Global()
@Module({
  providers: [PolicyConfigReader],
  exports: [PolicyConfigReader],
})
export class PolicyConfigModule {}
