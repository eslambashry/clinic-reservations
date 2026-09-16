import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../../../modules/audit/audit.module';
import { ListPolicyConfigsUseCase } from './list-policy-configs.use-case';
import { PolicyConfigReader } from './policy-config.reader';
import { PolicyConfigRepository } from './policy-config.repository';
import { PolicyConfigsController } from './policy-configs.controller';
import { UpsertPolicyConfigUseCase } from './upsert-policy-config.use-case';

/**
 * Global so any domain module can read `policy_configs` (commission rate,
 * cancellation fee tiers, ...) without each declaring its own import — same
 * pattern as `PrismaModule`/`OutboxModule`. `PolicyConfigReader` is the
 * unchanged read path every payment and notification depends on.
 *
 * The ADMIN write side (File 12 Part 36.1) lives here rather than in a
 * domain module because this folder owns the table. `AuditModule` is
 * imported for the in-transaction audit write; the dependency is one-way
 * (`AuditModule` reaches nothing in this kernel folder), so the global
 * module introduces no cycle. Only `PolicyConfigReader` stays exported —
 * the admin use-cases are this module's controller's alone.
 */
@Global()
@Module({
  imports: [AuditModule],
  controllers: [PolicyConfigsController],
  providers: [PolicyConfigReader, PolicyConfigRepository, ListPolicyConfigsUseCase, UpsertPolicyConfigUseCase],
  exports: [PolicyConfigReader],
})
export class PolicyConfigModule {}
