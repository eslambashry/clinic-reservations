import { Global, Module } from '@nestjs/common';
import { RequestContextService } from './request-context.service';

/**
 * Bugfix (found while building Phase 2's e2e tests — the first tests that
 * actually bootstrap the full `AppModule`): `RequestContextService` was a
 * bare provider in `CoreModule`, but `AppLoggingModule`'s
 * `LoggerModule.forRootAsync({ inject: [..., RequestContextService] })`
 * needs it in its own DI scope — a module can't resolve a provider from the
 * module that imports it (only the other way around), so this always threw
 * "Nest can't resolve dependencies of the pino-params" the moment anything
 * actually instantiated the module tree, not just at compile-time review.
 * `@Global()` here makes it resolvable everywhere in the graph without
 * every consumer needing to import it explicitly.
 */
@Global()
@Module({
  providers: [RequestContextService],
  exports: [RequestContextService],
})
export class RequestContextModule {}
